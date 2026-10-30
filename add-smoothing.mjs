import fs from 'node:fs';

const playerPath = 'C:/Users/User/.gemini/antigravity/scratch/sideseguate-streaming/src/components/LiveCameraPlayer.tsx';
let content = fs.readFileSync(playerPath, 'utf8');

content = content.replace(
  'ctx.drawImage(p2pImg, 0, 0, width, height);',
  'ctx.imageSmoothingEnabled = true;\n        ctx.imageSmoothingQuality = \'high\';\n        ctx.drawImage(p2pImg, 0, 0, width, height);'
);

fs.writeFileSync(playerPath, content, 'utf8');
console.log('LiveCameraPlayer.tsx smoothing added.');
