#!/usr/bin/env node
/**
 * Comprueba si un dominio sirve REALMENTE el build que tienes en `dist/`.
 *
 * Motivación: el workflow de Surge se marcaba "success" aunque no publicara
 * nada (faltaba SURGE_TOKEN). Mirar el estado del run no sirve; hay que mirar
 * el sitio.
 *
 * Uso:
 *   npm run build && node scripts/verify-deploy.mjs
 *   node scripts/verify-deploy.mjs https://otro-dominio.com
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const target = (process.argv[2] || 'https://sideseguate-streaming.surge.sh').replace(/\/+$/, '');

function assetFrom(html) {
  const match = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/);
  return match ? match[0] : null;
}

async function main() {
  const distIndex = resolve(repoRoot, 'dist/index.html');
  if (!existsSync(distIndex)) {
    console.error('No existe dist/index.html. Ejecuta primero:  npm run build');
    process.exit(1);
  }

  const expected = assetFrom(readFileSync(distIndex, 'utf8'));
  console.log(`\nDominio:  ${target}`);
  console.log(`Build:    ${expected || '(no se pudo leer dist/index.html)'}`);
  if (!expected) process.exit(1);

  let live = null;
  let reached = false;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const res = await fetch(`${target}/?cachebust=${Date.now()}`, {
        headers: { 'cache-control': 'no-cache' },
      });
      reached = true;
      if (!res.ok) {
        console.log(`  intento ${attempt}: HTTP ${res.status}`);
      } else {
        live = assetFrom(await res.text());
        console.log(`  intento ${attempt}: ${live || '(sin asset en el HTML)'}`);
        if (live === expected) break;
      }
    } catch (err) {
      console.log(`  intento ${attempt}: ${err.message}`);
    }
    if (attempt < 10) await new Promise((r) => setTimeout(r, 6000));
  }

  console.log('');
  if (live === expected) {
    console.log(`✅ ${target} sirve el build actual (${expected}).`);
    process.exit(0);
  }

  // Sin ninguna respuesta HTTP no se puede concluir nada sobre el despliegue.
  if (!reached) {
    console.log(`⚠️  No se pudo conectar con ${target} desde este equipo.`);
    console.log('   No es prueba de que el despliegue haya fallado: revisa tu conexión');
    console.log('   y vuelve a intentarlo, o ábrelo en el navegador.');
    process.exit(2);
  }

  const assetRes = await fetch(`${target}/assets/${expected.replace('assets/', '')}`)
    .then((r) => r.status)
    .catch(() => 'sin respuesta');

  console.log(`❌ ${target} NO sirve el build actual.`);
  console.log(`   Sirve:      ${live || '(nada)'}`);
  console.log(`   Se esperaba: ${expected}`);
  console.log(`   Estado de ese asset en el dominio: ${assetRes}`);
  console.log('');
  console.log('El despliegue no ocurrió. Revisa el secreto SURGE_TOKEN y el run del workflow.');
  process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
