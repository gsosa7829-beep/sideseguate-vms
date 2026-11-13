export interface OcosProjectMetadata {
  serial: string;
  projectName: string;
  entity: string;
  purchaser: string;
  nog: string;
  snip: string;
}

export const OCOS_PROJECTS_METADATA: Record<string, OcosProjectMetadata> = {
  // Imagen 1: Calle Sector Iglesia Tabernaculo
  FF9363192: {
    serial: 'FF9363192',
    projectName: 'MEJORAMIENTO CALLE SECTOR IGLESIA TABERNACULO COLONIA EL MEZQUITAL OCOS, SAN MARCOS',
    entity: 'MUNICIPALIDAD DE OCOS, SAN MARCOS',
    purchaser: 'MUNICIPALIDAD DE OCOS, SAN MARCOS.',
    nog: '31826717',
    snip: '0343162',
  },
  // Imagen 2: Calle Principal hacia el Instituto Basico
  FF9363270: {
    serial: 'FF9363270',
    projectName: 'MEJORAMIENTO CALLE PRINCIPAL HACIA EL INSTITUTO BASICO CASCO URBANO OCOS, SAN MARCOS',
    entity: 'MUNICIPALIDAD DE OCOS, SAN MARCOS',
    purchaser: 'MUNICIPALIDAD DE OCOS, SAN MARCOS.',
    nog: '31778720',
    snip: '0343164',
  },
  // Imagen 3: Calle Principal de Colonia el Mezquital hacia Casco Urbano
  FF9363285: {
    serial: 'FF9363285',
    projectName: 'MEJORAMIENTO CALLE PRINCIPAL DE COLONIA EL MEZQUITAL HACIA CASCO URBANO, OCOS, SAN MARCOS',
    entity: 'MUNICIPALIDAD DE OCOS, SAN MARCOS',
    purchaser: 'MUNICIPALIDAD DE OCOS, SAN MARCOS.',
    nog: '31798322',
    snip: '0343169',
  },
  // Imagen 4: Calle Sector el Campo de Futbol
  FF9363276: {
    serial: 'FF9363276',
    projectName: 'MEJORAMIENTO CALLE SECTOR EL CAMPO DE FUTBOL, CASCO URBANO, OCOS, SAN MARCOS',
    entity: 'MUNICIPALIDAD DE OCOS, SAN MARCOS',
    purchaser: 'MUNICIPALIDAD DE OCOS, SAN MARCOS.',
    nog: '31822029',
    snip: '0343165',
  },
};

export function getOcosMetadataForCamera(
  camera?: { deviceSerial?: string; id?: string; name?: string; notes?: string; locationDesc?: string } | null
): OcosProjectMetadata | null {
  if (!camera) return null;

  // 1. Coincidencia directa por número de serie
  const serial = camera.deviceSerial?.trim().toUpperCase();
  if (serial && OCOS_PROJECTS_METADATA[serial]) {
    return OCOS_PROJECTS_METADATA[serial];
  }

  // 2. Coincidencia buscando el serial en notas, id o locationDesc
  for (const s of Object.keys(OCOS_PROJECTS_METADATA)) {
    if (
      camera.id?.toUpperCase().includes(s) ||
      camera.notes?.toUpperCase().includes(s) ||
      camera.locationDesc?.toUpperCase().includes(s)
    ) {
      return OCOS_PROJECTS_METADATA[s];
    }
  }

  // 3. Coincidencia por palabras clave del nombre
  const name = (camera.name || '').toLowerCase();
  const desc = (camera.locationDesc || '').toLowerCase();
  const combined = `${name} ${desc}`;

  if (combined.includes('tabernaculo') || combined.includes('tabernáculo') || combined.includes('iglesia')) {
    return OCOS_PROJECTS_METADATA['FF9363192'];
  }
  if (combined.includes('instituto')) {
    return OCOS_PROJECTS_METADATA['FF9363270'];
  }
  if (combined.includes('mezquital')) {
    return OCOS_PROJECTS_METADATA['FF9363285'];
  }
  if (combined.includes('campo') || combined.includes('futbol') || combined.includes('fútbol')) {
    return OCOS_PROJECTS_METADATA['FF9363276'];
  }

  return null;
}
