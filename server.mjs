/*

 GRBLWeb - a web based CNC controller for GRBL
 Copyright (C) 2021 Andrew Hodel

 THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as published by
 the Free Software Foundation, either version 3 of the License.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.

 You should have received a copy of the GNU Affero General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.

 */

import qs from 'querystring';
import SerialPort from 'serialport';
import { createServer, get } from 'http';
import { Server as StaticServer } from 'node-static';
import { Server as SocketServer } from 'socket.io';

import config from './config.mjs';
import { getError } from './errors.mjs';

// test for webcam
config.showWebCam = false;

const webcamURL = `${config.host === 'localhost' ? '127.0.0.1' : config.host}:${config.webcamPort}`;

get(webcamURL, () => {
    // valid response, enable webcam
    console.log(`[${'Webcam'.blue}]: enabled webcam support`);
    config.showWebCam = true;
}).on('socket', (socket) => {
    // 2 second timeout on this socket
    socket.setTimeout(2000);
    socket.on('timeout', function () {
        this.abort();
    });
}).on('error', function (e) {
    const error = e.message.includes('ECONNREFUSED') ? `no webcam stream at URL ${webcamURL}` : e.message;
    console.log(`[${'Webcam'.blue}]: ${error.red}`);
});

const url = config.webPort === 80
    ? config.host
    : `${config.host}:${config.webPort}`;

console.log(`[${'Server'.blue}]: listening on port ${config.webPort.toString().green} (${url.green})`);

const httpServer = createServer(handler).listen(config.webPort);
const io = new SocketServer(httpServer, { /* options */ });
const fileServer = new StaticServer('./i');

function handler(req, res) {

    //console.log(req.url);

    if (req.url.indexOf('/api/uploadGcode') === 0 && req.method === 'POST') {
        // this is a gcode upload, probably from jscut
        console.log(`[${'jscut'.blue}]: new data`);

        let b = '';
        req.on('data', function (data) {
            b += data;
            if (b.length > 1e6) {
                req.connection.destroy();
            }
        });

        req.on('end', function () {
            const post = qs.parse(b);
            //console.log(post);
            io.sockets.emit('gcodeFromJscut', { 'val': post.val });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 'data': 'ok' }));
        });
    } else {
        fileServer.serve(req, res, function (err, _result) {
            if (err) {
                console.log(`[${'fileServer'.blue}]: ${String(err.message || err).red} (${req.url})`);
            }
        });
    }
}

const ESCAPE_MAP = {
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', '\'': '&#039;',
    '#': '&#035;'
};

function ConvChar(str) {
    return str.replace(/[<&>'"#]/g, (s) => ESCAPE_MAP[s]);
}

const ports = await SerialPort.list();
//console.log(ports);

const filtersRegexp = config.portsFilter?.trim();
const filter = filtersRegexp && new RegExp(filtersRegexp, 'iu');

const allPorts = filter ? ports.filter(({ path }) => !filter.test(path)) : ports;

const currentSocketPort = {};
let queuePause = 0;

if (filter && allPorts.length !== ports.length) {
    console.log(`[${'Serial'.blue}]: ignoring ports matching pattern: /${filtersRegexp.yellow}/iu`);
}

const sp = allPorts.map((descriptor, index) => makePort(index, descriptor));

function makePort(index, descriptor) {
    const serial = { ...descriptor };
    serial.idx = index;
    serial.q = [];
    serial.qCurrentMax = 0;
    serial.lastSerialWrite = [];
    serial.lastSerialReadLine = '';
    // read on the parser
    serial.handle = new SerialPort.parsers.Readline({ delimiter: '\r\n' });
    // 1 means clear to send, 0 means waiting for response
    serial.port = new SerialPort(serial.path, {
        baudRate: config.serialBaudRate
    });
    // write on the port
    serial.port.pipe(serial.handle);
    serial.sockets = [];

    serial.port.on('open', () => {
        console.log(`[${'Server'.blue}]: connected at ${serial.path.green} (${config.serialBaudRate.toString().green} baud)`);

        // loop for status ?
        setInterval(() => {
            //console.log('writing ? to serial');
            serial.port.write('?');
        }, 1000);
    });

    // line from serial port
    serial.handle.on('data', (data) => {
        //console.log('got data', data);
        serialData(data, serial.idx);
    });

    return serial;
}

function emitToPortSockets(port, evt, obj) {
    for (const socket of sp[port].sockets) {
        socket.emit(evt, obj);
    }
}

/**
 * @param {string} data
 * @param {number} index
 */
function serialData(data, index) {
    // handle ?
    if (data.indexOf('<') === 0) {
        // https://github.com/grbl/grbl/wiki/Configuring-Grbl-v0.8#---current-status

        // remove <> and split on , and :
        const [t0, _, t2, t3, t4, __, t6, t7, t8] = data.slice(1, data.length - 2).split(/[,:]/);

        emitToPortSockets(
            index,
            'machineStatus',
            { 'status': t0, 'mpos': [t2, t3, t4], 'wpos': [t6, t7, t8] }
        );

        return;
    }

    if (queuePause === 1) {
        // pause queue
        return;
    }

    data = ConvChar(data);

    const port = sp[index];

    if (data.startsWith('ok')) {
        // ok is green
        emitToPortSockets(
            index,
            'consoleDisplay',
            { 'line': '<span style="color: green;">RESP: ' + data + '</span>' }
        );

        // run another line from the q
        if (port.q.length > 0) {
            // there are remaining lines in the q
            // write one
            sendGCodeLine(index);
        }

        // remove first
        port.lastSerialWrite.shift();
    } else if (data.startsWith('error')) {

        // error is red
        const match = data.match(/^error\D*(?<code>\d+)/i);
        const errno = Number.isFinite(+match?.groups?.code) ? +match.groups.code : 0;
        const { code, name, help } = getError(errno);
        const line = code
            ? `<span style="color: red;" title="${help.replaceAll(
                '"',
                '&quot;'
            )}">RESP: ${name}<sup style="color: blue">i</sup></span>`
            : '<span style="color: red;">RESP: ' + data + '</span>';

        emitToPortSockets(index, 'consoleDisplay', { line });

        // run another line from the q
        if (port.q.length > 0) {
            // there are remaining lines in the q
            // write one
            sendGCodeLine(index);
        }

        // remove first
        port.lastSerialWrite.shift();

    } else {
        // other is grey
        emitToPortSockets(
            index,
            'consoleDisplay',
            { 'line': '<span style="color: #888;">RESP: ' + data + '</span>' }
        );
    }

    if (port.q.length === 0) {
        // reset max once queue is done
        port.qCurrentMax = 0;
    }

    // update q status
    emitToPortSockets(index, 'qStatus', { 'currentLength': port.q.length, 'currentMax': port.qCurrentMax });

    port.lastSerialReadLine = data;
}

function escape(text) {
    return text.replaceAll('"', '\\"');
}

function sendGCodeLine(index) {
    const port = sp[index];

    if (port.q.length < 1) {
        // nothing to send
        console.log(`[${'GCODE'.blue}]: done`);
        return;
    }

    // remove any comments after the command and trim it because we create the \n
    const t = port.q.shift().split(';', 1)[0].trim();

    if (!t || t.startsWith(';')) {
        // this is a comment or blank line, go to next
        sendGCodeLine(index);
        return;
    }

    //console.log('sending '+t+' ### '+sp[port].q.length+' current q length');

    // loop through all registered port clients
    emitToPortSockets(
        index,
        'consoleDisplay',
        {
            'line': `<span style="color: black;">SEND: <span style="cursor: pointer" onclick="sendCommand('${escape(
                t)}')">${t} &rarr;</span></span>\n`
        },
    );

    console.log(`[${'GCODE'.blue}]: ${t}`);
    port.port.write(t + '\n');
    port.lastSerialWrite.push(t);
}

io.sockets.on('connection', function (socket) {
    socket.emit('ports', allPorts.map((port, idx) => ({ ...port, idx })));
    socket.emit('config', config);

    // do soft reset, this has it's own clear and direct function call
    socket.on('doReset', function (_data) {
        const port = sp[currentSocketPort[socket.id]];
        // soft reset for grbl, send ctrl-x ascii \030
        port.port.write('\x18');
        // reset vars
        port.q = [];
        port.qCurrentMax = 0;
        port.lastSerialWrite = [];
        port.lastSerialRealLine = '';
    });

    // lines from web ui
    socket.on('gcodeLine', function ({ line }) {
        const current = currentSocketPort[socket.id];

        if (current) {
            const port = sp[current];

            // valid serial port selected, safe to send
            // split newlines
            const nl = line.split('\n');
            // add to queue
            port.q = port.q.concat(nl);
            // add to qCurrentMax
            port.qCurrentMax += nl.length;

            if (port.q.length === nl.length) {
                // there was no previous q so write a line
                sendGCodeLine(current);
            }
        } else {
            socket.emit('serverError', 'you must select a serial port');
        }
    });

    socket.on('clearQ', function (_data) {
        // clear the command queue
        sp[currentSocketPort[socket.id]].q = [];
        // update the status
        emitToPortSockets(currentSocketPort[socket.id], 'qStatus', { 'currentLength': 0, 'currentMax': 0 });
    });

    socket.on('pause', function (data) {
        // pause queue
        if (data === 1) {
            console.log('pausing queue');
            queuePause = 1;
        } else {
            console.log('unpausing queue');
            queuePause = 0;
            sendGCodeLine(currentSocketPort[socket.id]);
        }
    });

    socket.on('disconnect', () => dropSocket(socket.id));

    socket.on('usePort', function (data) {
        const id = socket.id;
        const port = sp[data];
        const current = currentSocketPort[id];
        console.log(`[${'Serial'.blue}]: user wants to use port ${String(data).yellow}`);

        if (current) {
            console.log(`[${'Serial'.blue}]: switching from ${String(current).yellow}`);
        }

        dropSocket(id);

        if (port) {
            currentSocketPort[id] = data;
            port.sockets.push(socket);
        } else {
            socket.emit('serverError', 'that serial port does not exist');
        }
    });
});

function dropSocket(id) {
    const current = currentSocketPort[id];

    if (current) {
        const sockets = sp[current].sockets;
        const idx = sockets.findIndex((item) => item.id === id);

        if (idx >= 0) {
            sockets.splice(idx, 1);
        }
    }
}
