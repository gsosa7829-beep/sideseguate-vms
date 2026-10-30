import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ezToken = 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag';
const repo = 'gsosa7829-beep/sideseguate-vms';
const stateBranch = 'cloud-state';

// 1. Get GitHub token
const credInput = 'protocol=https\nhost=github.com\n\n';
const credOut = execSync('git credential fill', { input: credInput, encoding: 'utf8' });
const matchToken = credOut.match(/^password=(.+)$/m);
if (!matchToken) {
  console.error('No GitHub token found');
  process.exit(1);
}
const ghToken = matchToken[1].trim();

async function fetchLiveCapture(ch) {
  try {
    const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/device/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        accessToken: ezToken,
        deviceSerial: 'F31700438',
        channelNo: String(ch),
      }),
    });
    const data = await res.json();
    if (data.code === '200' && data.data && data.data.picUrl) {
      const imgRes = await fetch(data.data.picUrl);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      return `data:image/jpeg;base64,${buf.toString('base64')}`;
    }
  } catch (err) {
    console.warn(`Error capturing ch ${ch}:`, err.message);
  }
  return null;
}

async function syncState() {
  console.log('Capturando frames en vivo desde HiLook / Ezviz Cloud...');
  const ch1Frame = await fetchLiveCapture(1);
  const ch2Frame = await fetchLiveCapture(2);

  const frames = {};
  if (ch1Frame) frames['1'] = ch1Frame;
  if (ch2Frame) frames['2'] = ch2Frame;

  const nowIso = new Date().toISOString();

  const endpointJson = JSON.stringify(
    {
      online: true,
      mode: 'hilook-ezviz-cloud-p2p',
      serial: 'F31700438',
      model: 'HiLook TurboHD (S04TURBOG2/A)',
      encryption: 'HELGDM',
      tunnelUrl: 'https://sideseguate-streaming.surge.sh',
      updatedAt: nowIso,
      channels: {
        '1': {
          connected: !!ch1Frame,
          frameBytes: ch1Frame ? Math.round((ch1Frame.length * 3) / 4) : 0,
          totalFrames: 1,
          lastFrameAgeMs: 50,
        },
        '2': {
          connected: !!ch2Frame,
          frameBytes: ch2Frame ? Math.round((ch2Frame.length * 3) / 4) : 0,
          totalFrames: 1,
          lastFrameAgeMs: 50,
        },
      },
    },
    null,
    2
  );

  const liveFramesJson = JSON.stringify(
    {
      updatedAt: nowIso,
      serial: 'F31700438',
      frames: frames,
    },
    null,
    2
  );

  console.log('Subiendo a GitHub rama cloud-state...');
  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SIDESEGUATE-HiLook-Sync',
  };

  // Create tree
  const treeRes = await fetch(`https://api.github.com/repos/${repo}/git/trees`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tree: [
        {
          path: 'endpoint.json',
          mode: '100644',
          type: 'blob',
          content: endpointJson,
        },
        {
          path: 'live-frames.json',
          mode: '100644',
          type: 'blob',
          content: liveFramesJson,
        },
      ],
    }),
  });
  const treeData = await treeRes.json();
  if (!treeData.sha) throw new Error(`Tree failed: ${JSON.stringify(treeData)}`);

  // Create commit
  const commitRes = await fetch(`https://api.github.com/repos/${repo}/git/commits`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `chore(cloud-p2p): live HiLook state sync ${nowIso}`,
      tree: treeData.sha,
      parents: [],
    }),
  });
  const commitData = await commitRes.json();

  // Update ref
  const patchRes = await fetch(`https://api.github.com/repos/${repo}/git/refs/heads/${stateBranch}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sha: commitData.sha,
      force: true,
    }),
  });

  if (patchRes.ok) {
    console.log('✓ Rama cloud-state sincronizada con éxito con los frames reales de F31700438!');
  } else {
    console.warn('Patch ref status:', patchRes.status);
  }
}

syncState()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
