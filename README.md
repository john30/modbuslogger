modbuslogger
============

modbuslogger is a simple example of using the modbus-serial package for logging the data of a Modbus device, especially
the Eastron SDM72D. It can talk to a TCP Modbus server or directly to a serial connected Modbus device.

Usage
-----
```bash
usage: node index.js [-i deviceid] [-r registerid | -a] [destination]  
with:  
  -i deviceid    use device with deviceid (default: 1)  
  -r registerid  read specified input register instead of all (multiple allowed)  
  -a             read all holding registers as well  
  destination    the destination to read from (default: 127.0.0.1), one of:  
                   serial device with optional speed if other than 9600, e.g. /dev/ttyUSB1:19200  
                   hostname or IP address with optional port if other than 502, e.g. modbussserver:1502  
```
The most simple usage is with ```node index.js``` which will open a connection to a local Modbus TCP server (such as mbusd)
at port 502 and retrieving all input registers for device ID 1.

Sample output looks like this:  
```text
Total system power:384
Import Wh since last reset:123123.339
Export Wh since last reset:0.020
Total kwh:123123.359
Settable total kWh:123123.359
Settable import kWh:123123.339
Settable export kWh:0.020
Import power:384
Export power:0
```

Installation
------------
A recent NodeJS is required including npm. In order to install the required modules, just run ```npm install```.
