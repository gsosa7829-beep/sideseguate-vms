import fs from 'node:fs';

const filePath = 'C:/Users/User/.gemini/antigravity/scratch/sideseguate-streaming/src/lib/initialData.ts';
let c = fs.readFileSync(filePath, 'utf8');

const newHardware = `export const CLIENT_HIKVISION_HARDWARE = [
  {
    model: 'HiLook DVR TurboHD (Proyecto Calle del Cementerio)',
    name: 'HiLookVision Desktop Client (F31700438)',
    serial: 'F31700438',
    shortSerial: 'F31700438',
    verificationCode: 'HELGDM',
    lanIp: '192.168.0.3',
    publicIp: '54.156.218.223',
    serverPort: 8890,
    httpPort: 80,
    rtspPort: 554,
    totalChannels: 2,
    recommendedStream: '1080p FHD Realtime Stream',
    rtspSyntaxExample: 'rtsp://admin:HELGDM@127.0.0.1:554/Streaming/Channels/101'
  }
];`;

c = c.replace(/export const CLIENT_HIKVISION_HARDWARE = \[[\s\S]*?\];\r?\n\r?\nexport const INITIAL_PROJECTS/, `${newHardware}\n\nexport const INITIAL_PROJECTS`);

fs.writeFileSync(filePath, c, 'utf8');
console.log('Hardware updated.');
