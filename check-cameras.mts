import { INITIAL_CAMERAS } from './src/lib/initialData.ts';

console.log('Total INITIAL_CAMERAS:', INITIAL_CAMERAS.length);
INITIAL_CAMERAS.forEach((c, i) => console.log(`${i + 1}. [${c.id}] ${c.name} (${c.deviceSerial || c.host})`));
