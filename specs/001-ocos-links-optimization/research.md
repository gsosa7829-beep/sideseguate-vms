# Research: Optimización de Enlaces Activos de Proyecto Ocós y Miniaturas en Vivo

## 1. Resolución real de las 4 TinyURLs enviadas por WhatsApp

- **Decision**: Mantener compatibilidad completa de las URLs `?token=proyecto-ocos&camera=<SERIAL>` resolviéndolas hacia el enlace NOG individual correspondiente (`31778720`, `31826717`, `31798322`, `31822029`) tanto desde el estado sincronizado en Firestore (`shareLinks`) como desde `INITIAL_SHARE_LINKS`, y suscribir `ClientLivePortal` al token resuelto (`shareLink?.token || token`).
- **Rationale**: Se comprobó con `scripts/check-tinyurls.mjs` que las 4 TinyURLs enviadas por WhatsApp (`ocos-instituto-31778720`, `ocos-tabernaculo-31826717`, `ocos-mezquital-31798322`, `ocos-campo-31822029`) redirigen a `https://proyectos-de-camaras.surge.sh/?token=proyecto-ocos&camera=FF9363...`. Si se eliminara el soporte de `&camera=` o se suscribiera Firestore por `'proyecto-ocos'`, las TinyURLs no obedecerían pausas, cambios a vigencia permanente (`expiresAt: null`) ni eliminación desde el panel. Por otro lado, acceder a `proyecto-ocos` sin `&camera=` o a `calle-del-cementerio` debe devolver enlace no disponible tras su borrado.
- **Alternatives considered**: Cambiar las URLs destino en TinyURL (descartado porque ya fueron enviadas y están fuera del control del repositorio).

## 2. Origen y corrección de las miniaturas viejas (`11-01-2026`)

- **Decision**: Eliminar por completo las referencias estáticas a `/frames/ocos-ch1.jpg`, `/frames/f317-ch1.jpg` y `/frames/f317-ch2.jpg` en `LiveCameraPlayer.tsx` (`resolvedPoster`) y `VideoWall.tsx` (`getCameraPoster`); migrar `CAPTURE_CACHE_STORAGE_KEY` a `sideseguate_ezviz_capture_cache_v3` con marca temporal `{ url, capturedAt }` y TTL de 24 horas; capturar el fotograma vivo real tanto desde `<video>` como desde `<canvas>` (validando que no sea un frame vacío/negro) al reproducir y justo antes de pausar.
- **Rationale**: `public/frames/ocos-ch1.jpg` es una foto estática tomada el `31/10/2026` (`11-01-2026` en OSD), y `LiveCameraPlayer.tsx` la renderizaba detrás del overlay de reposo siempre que `resolvedPoster` tenía valor, además de impedir refrescar `ezvizCaptureCache` si ya existía una clave previa (`if (!video.videoWidth || ezvizCaptureCache[key]) return;`). Cuando EZUIKit usa `<video>` o WebGL sin `preserveDrawingBuffer`, `canvas.toDataURL()` podía fallar o quedar negro, dejando expuesta la foto vieja.
- **Alternatives considered**: Reemplazar `ocos-ch1.jpg` por otra imagen estática en `public/frames/` (descartado porque volvería a quedar desactualizada en días futuros).

## 3. Optimización del portal público y aislamiento de reloj / rutas limpias

- **Decision**:
  1. Extraer el contador regresivo de expiración de `ClientLivePortal.tsx` a un subcomponente aislado (`ExpirationBadge`) que solo haga tick cada 1 s cuando falte menos de 1 hora (cada 60 s cuando falten días/meses, y sin `setInterval` cuando es permanente `expiresAt === null`).
  2. Memorizar `allowedCameras` y reemplazar `prewarmHikvisionCameras()` genérico (que llamaba a `FF9363270` y `F31700438` cada vez que cambiaba la referencia del array) por precarga acotada al equipo del enlace (y sin disparar peticiones para cámaras ajenas).
  3. Actualizar `adminAuthStorage.isAuthorizedOwnerDevice()` para reconocer también rutas limpias de enlaces compartidos (`/31778720`, `/31826717`, `/31798322`, `/31822029`, `/token/...`, `/share/...`, `/enlace/...`, `/t/...`) y pasar `window.location.pathname` en `App.tsx` al detectar `isVisitorClientRoute`.
  4. Aplicar `container.replaceChildren()` en lugar de `container.innerHTML = ''` al reiniciar contenedores del reproductor, siguiendo las guías de `modern-web-guidance`.
- **Rationale**: En el código actual, `nowTick` (`setInterval` de 1 s) provoca 60 re-renders por minuto de todo `ClientLivePortal`, recrea `allowedCameras` en cada render y re-ejecuta el efecto de `prewarmHikvisionCameras()`. Además, las rutas limpias no eran detectadas como visitantes en `isVisitorClientRoute` ni en `isAuthorizedOwnerDevice()`.
- **Alternatives considered**: Desactivar el reloj en cabecera (descartado porque el badge visible de 3 meses / permanente da claridad al cliente).

## 4. Limpieza de Firestore y recuperación de CI/Tests

- **Decision**: Purgar de Cloud Firestore (`cloud_share_links` para `sideseguate_cloud_v1`) los 4 documentos antiguos `sdg_live_*` y publicar/sincronizar únicamente los 4 enlaces oficiales (`31778720`, `31826717`, `31798322`, `31822029`); migrar `STORAGE_KEYS.SHARE_LINKS` en `src/lib/storage.ts` a `sideseguate_share_links_v13_ocos_only` (limpiando la clave anterior `v12`); reparar los 2 tests obsoletos de navegación en `src/lib/streamingLogic.test.ts` (alineándolos a las 3 secciones actuales de `src/lib/navigation.ts`) y añadir pruebas de regresión para resolución de TinyURLs, rutas limpias y frescura de miniaturas.
- **Rationale**: `cloud_share_links` en Firestore tenía actualmente solo 4 enlaces antiguos `sdg_live_*` mientras los 4 NOGs vivían únicamente en código/localStorage. Sincronizar Firestore garantiza consistencia real en la nube y permite pausar o cambiar a permanente cualquiera de los 4 enlaces desde el panel.
