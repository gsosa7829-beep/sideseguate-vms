# Data Model: Optimización de Enlaces Activos de Proyecto Ocós y Miniaturas en Vivo

## Entidades y Restricciones Canónicas

### 1. `ShareLink` (`src/lib/types.ts` · colección `cloud_share_links`)
Representa un enlace autorizado para el cliente final.

- `ShareLink.id`: string (`link-ocos-instituto`, `link-ocos-tabernaculo`, `link-ocos-mezquital`, `link-ocos-campo`, o id generado por el operador).
- `ShareLink.token`: string único (los 4 tokens oficiales activos son `31778720`, `31826717`, `31798322`, `31822029`; los tokens antiguos `proyecto-ocos`, `calle-del-cementerio` y `sdg_live_*` quedan eliminados del catálogo).
- `ShareLink.projectId`: string (`proj-ocos`).
- `ShareLink.cameraIds`: string[] con exactamente 1 cámara asignada por enlace NOG para aislamiento estricto:
  - `31778720` → `['cam-ai-1794444552597-ch1']` (`FF9363270`, Calle del Instituto)
  - `31826717` → `['cam-ai-1794439370109-ch1']` (`FF9363192`, Calle Sector Iglesia Tabernáculo)
  - `31798322` → `['cam-ai-1794444422794-ch1']` (`FF9363285`, Calle Principal Colonia El Mezquital)
  - `31822029` → `['cam-ai-1794439784940-ch1']` (`FF9363276`, Calle Sector El Campo de Fútbol)
- `ShareLink.expiresAt`: `string | null` (ISO-8601 a 3 meses `'2027-02-13T23:59:59.000Z'` o `null` cuando se configura como **Permanente**).
- `ShareLink.isActive`: boolean (`true` mientras está habilitado; `false` al pausar/inhabilitar desde el panel).

### 2. `CameraCaptureEntry` (`src/lib/captureCache.ts` / `localStorage` `sideseguate_ezviz_capture_cache_v3`)
Representa una captura reciente obtenida directamente del flujo real de una cámara.

- `CameraCaptureEntry.url`: string (`data:image/jpeg;base64,...` o URL HTTPS fresca devuelta por `lapp/device/capture`).
- `CameraCaptureEntry.capturedAt`: number (epoch ms). Entradas con antigüedad mayor a 24 h (`CAPTURE_MAX_AGE_MS`) o de versiones previas sin timestamp se descartan automáticamente.
- Clave de caché: `${deviceSerial}_${channel}` (por ejemplo `FF9363270_1`).

### 3. Mapeo de Compatibilidad TinyURL → `ShareLink.token` (`src/lib/ocosShareResolution.ts`)
Función pura compartida entre `App.tsx`, `ClientLivePortal.tsx` y tests:

- Entrada: `{ tokenParam, cameraParam, pathname, shareLinks }`
- Regla: Si existe parámetro `camera`/`cam`/`serial` (ej. `FF9363270` en `?token=proyecto-ocos&camera=FF9363270`), mapea al token NOG individual correspondiente (`31778720`, `31826717`, `31798322`, `31822029`) y busca el `ShareLink` vigente primero en `shareLinks` (Firestore/local) y como respaldo en `INITIAL_SHARE_LINKS`.
- Si `tokenParam === 'proyecto-ocos'` sin parámetro de cámara o `tokenParam === 'calle-del-cementerio'`, no devuelve enlace activo de respaldo (se muestra estado de enlace no disponible).
