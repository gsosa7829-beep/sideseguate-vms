import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getOcosMetadataForCamera, OCOS_PROJECTS_METADATA } from './ocosMetadata';

test('getOcosMetadataForCamera maps each Ocós camera to its official municipal contract', () => {
  // 1. Calle Sector Iglesia Tabernáculo (FF9363192)
  const meta1 = getOcosMetadataForCamera({
    deviceSerial: 'FF9363192',
    name: 'Calle Iglesia del Tabernáculo Ocos',
  });
  assert.ok(meta1);
  assert.equal(meta1.serial, 'FF9363192');
  assert.equal(meta1.nog, '31826717');
  assert.equal(meta1.snip, '0343162');
  assert.equal(
    meta1.projectName,
    'MEJORAMIENTO CALLE SECTOR IGLESIA TABERNACULO COLONIA EL MEZQUITAL OCOS, SAN MARCOS'
  );
  assert.equal(meta1.entity, 'MUNICIPALIDAD DE OCOS, SAN MARCOS');

  // 2. Calle Principal hacia el Instituto Básico (FF9363270)
  const meta2 = getOcosMetadataForCamera({
    deviceSerial: 'FF9363270',
    name: 'Calle del Instituto',
  });
  assert.ok(meta2);
  assert.equal(meta2.serial, 'FF9363270');
  assert.equal(meta2.nog, '31778720');
  assert.equal(meta2.snip, '0343164');
  assert.equal(
    meta2.projectName,
    'MEJORAMIENTO CALLE PRINCIPAL HACIA EL INSTITUTO BASICO CASCO URBANO OCOS, SAN MARCOS'
  );

  // 3. Calle Principal de Colonia el Mezquital hacia Casco Urbano (FF9363285)
  const meta3 = getOcosMetadataForCamera({
    deviceSerial: 'FF9363285',
    name: 'Calle Colonia el Mezquital',
  });
  assert.ok(meta3);
  assert.equal(meta3.serial, 'FF9363285');
  assert.equal(meta3.nog, '31798322');
  assert.equal(meta3.snip, '0343169');
  assert.equal(
    meta3.projectName,
    'MEJORAMIENTO CALLE PRINCIPAL DE COLONIA EL MEZQUITAL HACIA CASCO URBANO, OCOS, SAN MARCOS'
  );

  // 4. Calle Sector el Campo de Fútbol (FF9363276)
  const meta4 = getOcosMetadataForCamera({
    deviceSerial: 'FF9363276',
    name: 'Calle sector el campo ocos',
  });
  assert.ok(meta4);
  assert.equal(meta4.serial, 'FF9363276');
  assert.equal(meta4.nog, '31822029');
  assert.equal(meta4.snip, '0343165');
  assert.equal(
    meta4.projectName,
    'MEJORAMIENTO CALLE SECTOR EL CAMPO DE FUTBOL, CASCO URBANO, OCOS, SAN MARCOS'
  );

  // 5. Non-Ocós camera (e.g. Cementerio) should return null
  const metaCementerio = getOcosMetadataForCamera({
    deviceSerial: 'F31700438',
    name: 'Cámara 1 · Portón Calle del Cementerio',
  });
  assert.equal(metaCementerio, null);
});
