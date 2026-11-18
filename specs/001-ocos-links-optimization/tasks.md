---

description: "Task list for Optimización de Enlaces Activos de Proyecto Ocós y Miniaturas en Vivo"
---

# Tasks: Optimización de Enlaces Activos de Proyecto Ocós y Miniaturas en Vivo

**Input**: Design documents from `/specs/001-ocos-links-optimization/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `quickstart.md`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Crear los helpers puros compartidos para resolución de enlaces/TinyURLs y caché de capturas con frescura.

- [X] T001 [P] Crear helper puro de resolución de enlaces Ocós y TinyURLs (`resolveOcosShareLink`, `mapCameraParamToOcosToken`) respetando `ShareLink.token`, `ShareLink.cameraIds`, `ShareLink.isActive` y `ShareLink.expiresAt` según `data-model.md` en `src/lib/ocosShareResolution.ts`
- [X] T002 [P] Crear helper puro de caché de capturas con marca temporal y TTL de 24 h (`CameraCaptureEntry.url`, `CameraCaptureEntry.capturedAt`, clave `sideseguate_ezviz_capture_cache_v3`) según `data-model.md` en `src/lib/captureCache.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Depurar el catálogo inicial, persistencia local y reglas de rutas limpias que sostienen todas las historias.

- [X] T003 Actualizar `INITIAL_SHARE_LINKS` dejando únicamente los 4 enlaces individuales de Proyecto Ocós (`31778720`, `31826717`, `31798322`, `31822029`) con `ShareLink.cameraIds` de 1 cámara y `ShareLink.expiresAt` según `data-model.md` en `src/lib/initialData.ts`
- [X] T004 Migrar `STORAGE_KEYS.SHARE_LINKS` a `sideseguate_share_links_v13_ocos_only` y limpiar la clave heredada `sideseguate_share_links_v12_revoked` para purgar enlaces eliminados de cachés previos en `src/lib/storage.ts`
- [X] T005 [P] Actualizar `adminAuthStorage.isAuthorizedOwnerDevice()` para reconocer rutas limpias (`/31778720`, `/31826717`, `/31798322`, `/31822029`, `/token/...`, `/share/...`, `/enlace/...`, `/t/...`) como enlaces externos de cliente en `src/lib/adminAuth.ts`

**Checkpoint**: Catálogo base limpio y detección segura de rutas limpias listos.

---

## Phase 3: User Story 1 - Catálogo Limpio y Compatibilidad de TinyURLs (Priority: P1) 🎯 MVP

**Goal**: Dejar activos únicamente los 4 enlaces oficiales tanto en código como en Firestore, manteniendo funcionales las 4 TinyURLs enviadas por WhatsApp con control en vivo de vigencia (3 meses / permanente / pausa).

**Independent Test**: Consultar `cloud_share_links` en Firestore verificando exactamente 4 documentos (`31778720`, `31826717`, `31798322`, `31822029`), probar resolución de `?token=proyecto-ocos&camera=FF9363270` hacia `31778720` respetando pausa/permanencia, y verificar que `proyecto-ocos` sin cámara y `calle-del-cementerio` quedan no disponibles.

- [X] T006 [US1] Actualizar la resolución de `clientTokenView` (usando `resolveOcosShareLink` y pasando `window.location.pathname` a `extractTokenFromUrl` en `isVisitorClientRoute`) en `src/App.tsx`
- [X] T007 [US1] Actualizar `ClientLivePortal` para resolver enlaces y suscribir Firestore sobre el `ShareLink.token` real resuelto (ej. `31778720` cuando viene `&camera=FF9363270`), eliminando el fallback público hacia `proyecto-ocos` multipantalla y `calle-del-cementerio` en `src/components/ClientLivePortal.tsx`
- [X] T008 [US1] Limpiar Cloud Firestore (`cloud_share_links` de `sideseguate_cloud_v1`) eliminando los 4 documentos `sdg_live_*` obsoletos y sincronizando únicamente los 4 enlaces oficiales (`31778720`, `31826717`, `31798322`, `31822029`) respetando las reglas de `firestore.rules`

**Checkpoint**: Solo los 4 enlaces quedan en el panel/Firestore y todas las TinyURLs responden en tiempo real a pausa/vigencia/permanencia.

---

## Phase 4: User Story 2 - Miniaturas Reales Actualizadas sin Imágenes Obsoletas (Priority: P1)

**Goal**: Eliminar por completo las fotografías estáticas antiguas (`/frames/ocos-ch1.jpg`, `/frames/f317-ch1.jpg`, `/frames/f317-ch2.jpg`) y mostrar en pausa únicamente el fotograma real más reciente de la cámara o un fondo oscuro limpio.

**Independent Test**: Pausar o esperar la auto-pausa de 1 minuto tras ver video en vivo y comprobar que detrás de «Reanudar Transmisión» se muestra la captura reciente de esa sesión (o fondo limpio sin foto histórica si aún no ha reproducido).

- [X] T009 [P] [US2] Eliminar el fallback estático a `/frames/f317-ch*.jpg` y `/frames/ocos-ch1.jpg` en `getCameraPoster` y en la vista previa de carpetas usando `captureCache.ts` en `src/components/VideoWall.tsx`
- [X] T010 [US2] Eliminar `resolvedPoster` estático `/frames/*.jpg`, integrar `captureCache.ts` (`CameraCaptureEntry.url`, `CameraCaptureEntry.capturedAt`), capturar fotogramas reales válidos tanto de `<video>` como de `<canvas>` (al reproducir y al pausar sin bloquear actualizaciones posteriores), usar `replaceChildren()` al limpiar el contenedor EZUIKit y mostrar el último fotograma real en el overlay de reposo en `src/components/LiveCameraPlayer.tsx`

**Checkpoint**: Cero miniaturas viejas (`11-01-2026`); cada pausa refleja el último cuadro real de la cámara.

---

## Phase 5: User Story 3 - Optimización del Portal Público y Salud de Pruebas (Priority: P2)

**Goal**: Eliminar re-renders por segundo y precargas de cámaras ajenas en el portal de cliente, reparar los 2 tests rotos de navegación y agregar pruebas unitarias de regresión.

**Independent Test**: Ejecutar `npx tsc --noEmit`, `npm test` y `npm run build` con 100% de éxito y comprobar en navegador que no se hacen peticiones HLS a cámaras ajenas.

- [X] T011 [US3] Aislar el reloj de expiración en un subcomponente `ExpirationBadge` (intervalo de 60 s si falta > 1 h, 1 s solo si < 1 h, sin intervalo si es permanente), memorizar `allowedCameras` y acotar la precarga para evitar llamadas a cámaras ajenas (`F31700438` o canales distintos) en `src/components/ClientLivePortal.tsx` y `src/components/LiveCameraPlayer.tsx`
- [X] T012 [US3] Reparar los 2 tests obsoletos de navegación (`monitor`, `clients`, `devices`) y agregar pruebas unitarias para `resolveOcosShareLink` (TinyURLs + enlaces eliminados), `isAuthorizedOwnerDevice()` en rutas limpias y `captureCache` con TTL en `src/lib/streamingLogic.test.ts`

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación integral, limpieza de cachés SW viejas en `index.html`/PWA si aplica, auditoría de secretos y comprobación en vivo.

- [X] T013 Verificar ausencia de referencias residuales a `/frames/ocos-ch1.jpg` o `/frames/f317-ch` en `src/` y validar que `npx tsc --noEmit`, `npm test` y `npm run build` pasen al 100%
- [X] T014 Verificar en vivo (local preview o Surge tras despliegue si aplica) los 4 enlaces / TinyURLs y la miniatura tras pausa mediante `quickstart.md`

---

## Dependencies & Execution Order

- **Setup & Foundational**: Completados (`T001`–`T005`).
- **US1, US2, US3**: Completados (`T006`–`T012`).
- **Polish**: `T013` completado; falta `T014` (verificación en vivo en navegador).
