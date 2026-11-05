import fs from 'fs';
import { execSync } from 'child_process';

let netrc = '';
try {
  netrc = fs.readFileSync('C:/Users/User/.netrc', 'utf8');
} catch (e) {
  console.log('Error reading netrc:', e.message);
}
const match = netrc.match(/password\s+([a-zA-Z0-9_-]+)/);

if (!match) {
  console.error('Surge token not found in .netrc');
  process.exit(1);
}

const token = match[1];
const surgeBin = 'C:/Users/User/AppData/Local/Temp/bunx-1070947736-surge@latest/node_modules/surge/bin/surge';
const nodeBin = process.execPath;
const projectDir = 'C:/Users/User/.gemini/antigravity/scratch/sideseguate-streaming';
const domain = 'proyectos-de-camaras.surge.sh';

// Ensure 200.html and CNAME point strictly to proyectos-de-camaras.surge.sh
if (fs.existsSync(`${projectDir}/dist/index.html`)) {
  fs.copyFileSync(`${projectDir}/dist/index.html`, `${projectDir}/dist/200.html`);
}
fs.writeFileSync(`${projectDir}/dist/CNAME`, domain, 'utf8');
fs.writeFileSync(`${projectDir}/public/CNAME`, domain, 'utf8');

console.log(`Deploying exclusively to ${domain}...`);
const out = execSync(`"${nodeBin}" "${surgeBin}" ./dist ${domain}`, {
  cwd: projectDir,
  env: { ...process.env, SURGE_TOKEN: token, HOME: 'C:/Users/User', USERPROFILE: 'C:/Users/User' },
  encoding: 'utf8'
});
console.log(out);
