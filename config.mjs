import chalk from 'chalk';
import { configDotenv } from 'dotenv';

const { parsed } = configDotenv({
    path: '.env',
    override: true,
});

const names = ['reset',
    'bold',
    'dim',
    'italic',
    'underline',
    'overline',
    'inverse',
    'hidden',
    'strikethrough',
    'black',
    'red',
    'green',
    'yellow',
    'blue',
    'cyan',
    'magenta',
    'white',
    'gray',
    'grey',
    'blackBright',
    'redBright',
    'greenBright',
    'yellowBright',
    'blueBright',
    'cyanBright',
    'magentaBright',
    'whiteBright',
    'bgBlack',
    'bgRed',
    'bgGreen',
    'bgYellow',
    'bgBlue',
    'bgCyan',
    'bgMagenta',
    'bgWhite',
    'bgGray',
    'bgGrey',
    'bgBlackBright',
    'bgRedBright',
    'bgGreenBright',
    'bgYellowBright',
    'bgBlueBright',
    'bgCyanBright',
    'bgMagentaBright',
    'bgWhiteBright',
];

for (const name of names) {
    Object.defineProperty(String.prototype, name, {
        get() {
            return chalk[name](this);
        },
    });
}

export default {
    host: parsed.HOST || 'http://127.0.0.1',
    webPort: 80,
    // expects a webcam stream from mjpg_streamer
    webcamPort: 8080,
    serialBaudRate: 115200,
    usettyAMA0: 1,
};
