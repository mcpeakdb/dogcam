import mime from 'mime-types';
import fs from 'fs';

const BOUNDARY = 'TAMCamframe';

export function streamImage(image, fps, _req, res) {
    let imageBuffer;
    try {
        imageBuffer = fs.readFileSync(image);
    } catch {
        res.status(500).send('Stream image not found');
        return;
    }

    const contentType = mime.lookup(image) || 'image/jpeg';
    const frameInterval = 1000 / fps;

    res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Connection': 'close'
    });

    const timer = setInterval(() => {
        res.write(`--${BOUNDARY}\r\n`);
        res.write(`Content-Type: ${contentType}\r\n`);
        res.write(`Content-Length: ${imageBuffer.length}\r\n\r\n`);
        res.write(imageBuffer);
        res.write('\r\n');
    }, frameInterval);

    _req.on('close', () => clearInterval(timer));
}