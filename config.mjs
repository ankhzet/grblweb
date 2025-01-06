import { configDotenv } from 'dotenv';

const { parsed } = configDotenv({
    path: '.env',
    override: true,
});



export default {
    host: parsed.HOST || 'http://127.0.0.1',
    webPort: 80,
    // expects a webcam stream from mjpg_streamer
    webcamPort: 8080,
    serialBaudRate: 115200,
    usettyAMA0: 1,
};
