<!--
Sync Impact Report:
- Version change: template -> 1.0.0
- Modified principles: N/A (initial project constitution ratified)
- Added sections: Core Principles (I–V), Technical & Security Constraints, Development Workflow & Quality Gates, Governance
- Removed sections: None
- Follow-up TODOs: None
-->
# Proyecto de Cámaras (SIDESEGUATE VMS) Constitution

## Core Principles

### I. Seguridad de Credenciales y Nube
El código fuente del frontend (`src/`), el bundle público y Cloud Firestore MUST NOT exponer contraseñas de DVR, URLs `rtsp://` con credenciales ni secretos privados (`AppSecret` o contraseñas SSH). Toda sincronización a Firestore MUST respetar el esquema validado en `firestore.rules`; cualquier cambio futuro a `firestore.rules` MUST delegarse al flujo/subagente especializado (`firestore-rules-author`).

### II. Calidad y Verificación Obligatoria
Ninguna modificación de aplicación puede considerarse completa ni desplegable si rompe la verificación automática: `npx tsc --noEmit`, `npm test` y `npm run build` MUST pasar al 100% sin errores ni tests fallando. Todo bug corregido en enlaces, autenticación o reproducción MUST ir acompañado de cobertura en tests unitarios/regresión.

### III. Integridad de Enlaces y Compatibilidad TinyURL
El catálogo activo de enlaces compartidos MUST contener únicamente los enlaces explícitamente autorizados por el operador (vigentes de forma temporal, como 3 meses, o permanente hasta su inhabilitación/eliminación). Los enlaces cortos ya distribuidos (TinyURLs con `?token=proyecto-ocos&camera=...`) MUST resolver de forma exacta y aislada a su cámara NOG correspondiente y obedecer en tiempo real el estado (activo/pausado/vigencia/permanente) de Firestore. Las vistas de cliente (tanto por query string como por rutas limpias `/31778720`) MUST ocultar cualquier barra o control de administrador a visitantes externos.

### IV. Streaming 4G Optimizado y Miniaturas Reales
Las cámaras 4G con SIM MUST operar bajo demanda con auto-pausa para conservar datos (`0 KB/s` en reposo), evitando re-renders por segundo, efectos repetidos o llamadas de precalentamiento innecesarias a cámaras ajenas al enlace abierto. Al entrar en pausa o reposo, el reproductor MUST mostrar el fotograma real más reciente capturado de esa cámara (o un fondo neutro limpio) y MUST NOT mostrar imágenes estáticas obsoletas de archivo (`/frames/*.jpg` históricas).

### V. Simplicidad Operativa y Despliegue Verificado
La arquitectura de navegación y UI MUST mantenerse enfocada en el trabajo real del operador y del cliente final, sin pantallas ni alertas rotas. Todo despliegue web hacia `https://proyectos-de-camaras.surge.sh` MUST verificarse posteriormente comprobando tanto el bundle servido como los flujos reales en navegador.

## Technical & Security Constraints

- **Stack Frontend**: React 19, TypeScript, Vite 8, Tailwind CSS v4, `hls.js`, `ezuikit-js` (WASM H.265/H.264) y PWA (`vite-plugin-pwa`).
- **Estado y Nube**: Cloud Firestore (`cloud_projects`, `cloud_cameras`, `cloud_share_links`, `cloud_access_logs`) + `localStorage` como caché local resiliente sin secretos de DVR en la nube.
- **Compatibilidad de Navegadores**: La reproducción pública MUST funcionar en Chrome, Edge, Safari y navegadores móviles Android/iOS sin instalar aplicaciones nativas.
- **Higiene de Código**: Prohibido usar `innerHTML = ''` para limpiar contenedores dinámicos (preferir `replaceChildren()`), prohibido introducir credenciales de prueba en `src/` (bloqueado por CI).

## Development Workflow & Quality Gates

1. Toda mejora o corrección nueva se especifica y planifica en `specs/` mediante Spec Kit antes de editar código productivo.
2. En cambios de interfaz web o lógica cliente DOM/medios se consultan las guías vigentes de `modern-web-guidance`.
3. Antes de dar por terminada una iteración se ejecutan `npx tsc --noEmit`, `npm test` y `npm run build`, además de la auditoría de secretos en `src/`.
4. Los cambios publicados en Surge se validan en vivo comprobando estado de enlaces, miniaturas y ausencia de errores fatales de consola.

## Governance

Esta constitución prevalece sobre prácticas ad-hoc previas en el repositorio. Cualquier cambio a estos principios requiere actualizar este documento con incremento de versión semántica (`MAJOR` para cambios incompatibles, `MINOR` para nuevos principios o ampliaciones materiales, `PATCH` para aclaraciones) y mantener sincronizados los tests y especificaciones dependientes.

**Version**: 1.0.0 | **Ratified**: 2026-11-17 | **Last Amended**: 2026-11-17
