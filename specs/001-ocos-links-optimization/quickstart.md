# Quickstart Validation Guide: Optimización de Enlaces Activos de Proyecto Ocós y Miniaturas en Vivo

## 1. Verificación de tipos, tests y compilación

```powershell
npx tsc --noEmit
npm test
npm run build
```

Criterio esperado:
- `npx tsc --noEmit`: 0 errores.
- `npm test`: 100% de tests en verde (incluidos navegación, resolución de los 4 enlaces Ocós, compatibilidad TinyURL, exclusión de barra admin en rutas limpias y caché de miniaturas frescas sin `/frames/*.jpg`).
- `npm run build`: build limpio en `dist/` sin referencias a secretos prohibidos en `src/`.

## 2. Verificación en Cloud Firestore (`cloud_share_links`)

Consultar `cloud_share_links` para `ownerId == 'sideseguate_cloud_v1'`:
- Deben existir únicamente 4 documentos: `31778720`, `31826717`, `31798322` y `31822029`.
- Ningún documento `sdg_live_*`, `proyecto-ocos` ni `calle-del-cementerio` debe permanecer activo.

## 3. Verificación funcional en navegador (`https://proyectos-de-camaras.surge.sh` o local preview)

1. Abrir las 4 TinyURLs enviadas por WhatsApp:
   - `https://tinyurl.com/ocos-instituto-31778720`
   - `https://tinyurl.com/ocos-tabernaculo-31826717`
   - `https://tinyurl.com/ocos-mezquital-31798322`
   - `https://tinyurl.com/ocos-campo-31822029`
2. Comprobar que las 3 cámaras operativas en campo (`FF9363270`, `FF9363192`, `FF9363276`) abren en vivo aisladas con su placa NOG correcta, sin peticiones hacia otras cámaras ni barra de administrador.
3. Esperar la auto-pausa de 1 minuto (o pulsar Pausar) y confirmar que detrás de «Reanudar Transmisión» aparece el fotograma recién capturado (nunca `11-01-2026`).
4. Comprobar que un enlace borrado (`?token=calle-del-cementerio` o `?token=proyecto-ocos`) muestra «No encontramos este acceso».
