# Implementation Plan: Optimización de Enlaces Activos de Proyecto Ocós y Miniaturas en Vivo

**Branch**: `001-ocos-links-optimization` | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-ocos-links-optimization/spec.md`

## Summary

Depurar el catálogo de enlaces compartidos tanto en código (`INITIAL_SHARE_LINKS`, `storage.ts`) como en Cloud Firestore (`cloud_share_links`) para conservar únicamente los 4 enlaces individuales de Proyecto Ocós (`31778720`, `31826717`, `31798322`, `31822029`) preservando la compatibilidad total de las 4 TinyURLs enviadas por WhatsApp (`?token=proyecto-ocos&camera=...`) y el control en vivo de vigencia (3 meses / permanente / pausa). Simultáneamente, eliminar las miniaturas históricas obsoletas (`/frames/ocos-ch1.jpg`, `f317-ch*.jpg`) sustituyéndolas por capturas reales con TTL en `captureCache.ts`, aislar el contador de expiración en `ClientLivePortal.tsx` para eliminar re-renders por segundo y precargas ajenas, y corregir `isAuthorizedOwnerDevice()` y los 2 tests rotos de navegación.

## Technical Context

**Language/Version**: TypeScript 7 / React 19 / Vite 8 / Node.js 22
**Primary Dependencies**: `firebase` (Firestore), `hls.js`, `ezuikit-js` (WASM H.265/H.264), `lucide-react`, `tailwindcss` v4
**Storage**: Cloud Firestore (`cloud_share_links`, `cloud_cameras`, `cloud_projects`) + `localStorage` (`sideseguate_share_links_v13_ocos_only`, `sideseguate_ezviz_capture_cache_v3`)
**Testing**: Node native test runner vía `tsx --test src/lib/streamingLogic.test.ts` + `tsc --noEmit` + `vite build`
**Target Platform**: Navegadores web modernos de escritorio y móviles (Chrome, Safari, Edge) alojado como SPA estática en Surge (`proyectos-de-camaras.surge.sh`)
**Project Type**: Aplicación web SPA/PWA de videovigilancia
**Performance Goals**: Cero re-renders por segundo en `ClientLivePortal` mientras falte > 1 h para expirar; 0 peticiones hacia cámaras ajenas al enlace; < 1 s en mostrar captura real al pausar
**Constraints**: Sin cambios a `firestore.rules`; sin secretos en `src/`; mantener compatibilidad con TinyURLs ya emitidas (`?token=proyecto-ocos&camera=FF9363...`)
**Scale/Scope**: 4 enlaces públicos activos de cámara única, 2 proyectos y 6 cámaras registradas en catálogo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Seguridad de Credenciales y Nube**: CUMPLE. No se agregan contraseñas ni `AppSecret` en `src/` ni se modifica `firestore.rules`. Se refuerza `isAuthorizedOwnerDevice()` excluyendo rutas limpias compartidas.
- **II. Calidad y Verificación Obligatoria**: CUMPLE. Se reparan los 2 tests fallidos de navegación y se añaden tests unitarios para resolución de enlaces/TinyURLs, rutas limpias y caché de capturas con frescura.
- **III. Integridad de Enlaces y Compatibilidad TinyURL**: CUMPLE. Solo permanecen activos los 4 enlaces solicitados (`31778720`, `31826717`, `31798322`, `31822029`), se limpian `sdg_live_*`, `proyecto-ocos` multipantalla y `calle-del-cementerio`, y las 4 TinyURLs resuelven directo al `ShareLink` vivo correspondiente.
- **IV. Streaming 4G Optimizado y Miniaturas Reales**: CUMPLE. Se eliminan por completo los posters viejos (`/frames/*.jpg`), se captura el fotograma real en reproducción/pausa con TTL y se elimina el re-render por segundo y prewarm ajeno.
- **V. Simplicidad Operativa y Despliegue Verificado**: CUMPLE. Se valida con `tsc`, `npm test`, `npm run build` y comprobación real de despliegue en Surge si está disponible o mediante build local verificado.

## Project Structure

### Documentation (this feature)

```text
specs/001-ocos-links-optimization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── App.tsx
├── components/
│   ├── ClientLivePortal.tsx
│   ├── LiveCameraPlayer.tsx
│   └── VideoWall.tsx
└── lib/
    ├── adminAuth.ts
    ├── captureCache.ts            # Nuevo helper puro para caché de capturas con TTL
    ├── initialData.ts
    ├── ocosShareResolution.ts     # Nuevo helper puro para resolver tokens/TinyURLs Ocós
    ├── storage.ts
    └── streamingLogic.test.ts
```

**Structure Decision**: Mantener la estructura plana existente bajo `src/lib/` y `src/components/`, extrayendo dos helpers puros y testeables en Node (`ocosShareResolution.ts` y `captureCache.ts`) para cubrir las reglas críticas con pruebas unitarias sin acoplarse al DOM.

## Complexity Tracking

Sin violaciones a la constitución.
