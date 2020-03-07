"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ModbusRTU = require("modbus-serial");
const dns = require("dns");
let deviceId = 1;
let singleInputs = undefined;
let withHolding = false;
let serverAddr;
let serverPort;
let destination;
const usage = () => {
    console.log('usage: node ' + process.argv[1] + ' [-i deviceid] [-r registerid | -a] [-s [addr:]port] [destination]');
    console.log('with:');
    console.log('  -i deviceid    read from device with deviceid (default: 1)');
    console.log('  -r registerid  read specified input register instead of all (multiple allowed)');
    console.log('  -a             read all holding registers as well');
    console.log('  -s [addr:]port start a TCP server on addr and port');
    console.log('  destination    the destination to read from (default: 127.0.0.1), one of:');
    console.log('                   serial device with optional speed if other than 9600, e.g. /dev/ttyUSB1:19200');
    console.log('                   hostname or IP address with optional port if other than 502, e.g. modbussserver:1502');
    process.exit(1);
};
// SDM72D holding registers
const holdingRegisters = [
    { id: 13, type: 'float', name: 'Pulse 1 Width' },
    { id: 19, type: 'float', name: 'Parity / Stop' },
    { id: 21, type: 'float', name: 'Modbus Address' },
    { id: 23, type: 'float', name: 'Pulse 1 Rate' },
    { id: 25, type: 'float', name: 'Password' },
    { id: 29, type: 'float', name: 'Network Baud Rate' },
    { id: 59, type: 'float', name: 'Time for scrolling display' },
    { id: 61, type: 'float', name: 'Time of back light' },
];
// SDM72D input registers
const inputRegisters = [
    { id: 53, type: 'float', name: 'Total system power' },
    { id: 73, type: 'float', name: 'Import Wh since last reset' },
    { id: 75, type: 'float', name: 'Export Wh since last reset' },
    { id: 343, type: 'float', name: 'Total kwh' },
    { id: 385, type: 'float', name: 'Settable total kWh' },
    { id: 389, type: 'float', name: 'Settable import kWh' },
    { id: 391, type: 'float', name: 'Settable export kWh' },
    { id: 1281, type: 'float', name: 'Import power' },
    { id: 1283, type: 'float', name: 'Export power' },
];
// parse args
for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (!arg.startsWith('-')) {
        if (process.argv.length === i + 1) {
            destination = arg;
        }
        else {
            usage();
        }
        break;
    }
    switch (arg) {
        case '-i':
            deviceId = process.argv.length > i + 1 && parseInt(process.argv[++i], 10);
            if (!(deviceId >= 0 && deviceId <= 65535)) {
                usage();
            }
            break;
        case '-a':
            withHolding = true;
            break;
        case '-s':
            let serverStr = process.argv.length > i + 1 && process.argv[++i];
            if (!serverStr) {
                usage();
            }
            else {
                const parts = serverStr.split(':');
                if (parts.length === 2) {
                    serverAddr = parts[0] || '0.0.0.0';
                    serverStr = parts[1];
                }
                else if (parts.length === 1) {
                    serverAddr = '0.0.0.0';
                }
                else {
                    usage();
                }
                serverPort = parseInt(serverStr, 10);
                if (!(serverPort > 0 && serverPort <= 65535)) {
                    usage();
                }
            }
            break;
        case '-r':
            const singleInput = process.argv.length > i + 1 && process.argv[++i];
            if (!singleInput) {
                usage();
            }
            const numInput = parseInt(singleInput, 10);
            const foundInput = inputRegisters.find((input) => numInput ? input.id === numInput : input.name === singleInput);
            if (!foundInput) {
                usage();
            }
            if (!singleInputs) {
                singleInputs = [];
            }
            singleInputs.push(foundInput);
            break;
        default:
            usage();
            break;
    }
}
let destinationAddress;
let destinationIpPort;
let destinationSerialSpeed;
if (destination) {
    const parts = destination.split(':');
    if (parts.length > 2) {
        usage();
    }
    else if (destination.startsWith('/') || destination.startsWith('COM')) {
        destinationAddress = parts[0];
        if (parts.length === 2) {
            destinationSerialSpeed = parseInt(parts[1], 10);
            if (!(destinationSerialSpeed > 0 && destinationSerialSpeed <= 115200)) {
                usage();
            }
        }
        else {
            destinationSerialSpeed = 9600;
        }
    }
    else {
        destinationAddress = parts[0];
        if (parts.length === 2) {
            destinationIpPort = parseInt(parts[1], 10);
            if (!(destinationIpPort > 0 && destinationIpPort <= 65535)) {
                usage();
            }
        }
        else {
            destinationIpPort = 502;
        }
    }
}
else {
    destinationAddress = '127.0.0.1';
    destinationIpPort = 502;
}
// create an empty modbus client
const client = new ModbusRTU();
// set device ID to read
client.setID(deviceId);
const dumpValue = (register, data) => {
    let value;
    switch (register.type + ((register.wordLength || 2) * 2)) {
        case 'float4':
            value = data.buffer.readFloatBE(0).toFixed(3).replace(/\.?[0]*$/, '');
            break;
        default:
            value = data.buffer.readInt32BE(0);
            break;
    }
    console.log(register.name + ':' + value);
    return value;
};
const connect = async () => {
    if (destinationIpPort) {
        let ip;
        try {
            ip = await dns.promises.lookup(destinationAddress);
        }
        catch (e) {
            throw new Error('lookup error ' + destinationAddress);
        }
        client.setTimeout(5000); // a bit longer than via serial due to potential simultaneous access
        await client.connectTCP(ip.address, { port: destinationIpPort });
    }
    else {
        client.setTimeout(3000);
        await client.connectRTUBuffered(destinationAddress, { baudRate: destinationSerialSpeed });
    }
};
const read = async () => {
    let reading = '';
    try {
        reading = 'connect';
        await connect();
        if (withHolding) {
            for (const register of holdingRegisters) {
                reading = `read holding ${register.id}:${register.name}`;
                const d = await client.readHoldingRegisters(register.id - 1, register.wordLength || 2);
                dumpValue(register, d);
            }
        }
        for (const register of singleInputs || inputRegisters) {
            reading = `read input ${register.id}:${register.name}`;
            const d = await client.readInputRegisters(register.id - 1, register.wordLength || 2);
            dumpValue(register, d);
        }
    }
    catch (e) {
        console.error(`unable to ${reading}:`, e);
    }
    finally {
        process.exit(0);
    }
};
if (serverAddr) {
    setTimeout(async () => {
        try {
            await connect();
        }
        catch (e) {
            console.error(`unable to connect:`, e);
            process.exit(0);
        }
        console.log('server on ' + serverAddr + ':' + serverPort + ' for ' + destination);
        let blocked = false;
        const serverTCP = new ModbusRTU.ServerTCP({
            async getInputRegister(addr, unitID) {
                return new Promise((resolve, reject) => {
                    const doit = async () => {
                        if (blocked) {
                            setTimeout(doit, 50); // duration for one read at 9600 Bd is roughly 20ms
                            return;
                        }
                        blocked = true;
                        client.setID(unitID);
                        try {
                            for (let retries = 3; retries > 0; retries--) {
                                try {
                                    // workaround: actually only a single read should be necessary, but only with length=2 the result is correct
                                    const d = await client.readInputRegisters(addr, 2);
                                    console.log(`read ${addr} ok: ${d.data}`);
                                    resolve(d.data[0]);
                                    break;
                                }
                                catch (e) {
                                    if (retries > 1) {
                                        console.error(`read ${addr} fail, retrying: ${e.toString()}`);
                                    }
                                    else {
                                        throw e;
                                    }
                                }
                            }
                        }
                        catch (re) {
                            console.error(`read ${addr} fail: ${re.toString()}`);
                            reject(re);
                        }
                        finally {
                            blocked = false;
                        }
                    };
                    setTimeout(doit, 1);
                });
            },
        }, { host: serverAddr, port: serverPort, debug: true });
        serverTCP.on('SocketError', function (err) {
            console.error(err);
        });
    }, 1);
}
else {
    setTimeout(read, 1);
}
//# sourceMappingURL=index.js.map