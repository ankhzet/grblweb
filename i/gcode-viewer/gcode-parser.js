function GCodeParser(handlers) {
    this.handlers = handlers || {};
}

GCodeParser.prototype.parseLine = function(text, info) {
    text = text.replace(/;.*$/, '').trim(); // Remove comments
    if (text) {
        let tokens = text.split(' ');
        if (tokens) {
            let cmd = tokens[0];
            let args = {
                'cmd': cmd
            };
            tokens.splice(1).forEach(function(token) {
                let key = token[0];

                try {
                    key = key.toLowerCase();
                } catch (err) {
                    // if there's an error, it just means that toLowerCase cannot lowercase a space
                }

                args[key] = parseFloat(token.substring(1));
            });
            let handler = this.handlers[tokens[0]] || this.handlers['default'];
            if (handler) {
                return handler(args, info);
            }
        }
    }
};

GCodeParser.prototype.parse = function(gcode) {
    let lines = gcode.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (this.parseLine(lines[i], i) === false) {
            break;
        }
    }
};
