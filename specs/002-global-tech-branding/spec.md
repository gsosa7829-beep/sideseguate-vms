# Feature Specification: Identidad Visual y Marca GLOBAL TECH

**Feature Branch**: `002-global-tech-branding`  
**Created**: 2026-11-18  
**Status**: Completed  
**Input**: Implementar el nombre oficial del proyecto (**GLOBAL TECH · Seguridad Electrónica · Telecomunicaciones**) y su logotipo oficial en toda la plataforma web, PWA, metadatos OpenGraph y mensajes compartidos.

## User Scenarios & Testing

### User Story 1 - Identidad visual oficial en portal de clientes y enlaces compartidos (Priority: P1)

Cuando un cliente externo abre cualquiera de los enlaces compartidos (por ejemplo las 4 TinyURLs de Proyecto Ocós en WhatsApp), debe ver la marca **GLOBAL TECH** y su emblema oficial en el encabezado, pantalla de PIN, tarjeta QR y pie de página, sin alterar la resolución ni estabilidad de las cámaras.

**Acceptance Scenarios**:

1. **Given** un visitante abre `?token=proyecto-ocos&camera=FF9363270` o `/31778720`, **When** carga el portal público, **Then** el encabezado muestra el isotipo oficial de GLOBAL TECH, el título `GLOBAL TECH` y el pie de página `© 2026 GLOBAL TECH · Seguridad Electrónica · Telecomunicaciones`, sin mostrar barra admin.
2. **Given** un enlace se comparte en WhatsApp o navegadores sociales, **When** se leen las etiquetas OpenGraph / HTML (`<title>`, `og:title`, `og:image`), **Then** muestran `GLOBAL TECH — Seguridad Electrónica · Telecomunicaciones` y la imagen `og-global-tech.jpg`.

---

### User Story 2 - Marca consistente en panel administrador, acceso, QR y PWA (Priority: P2)

Cuando el operador abre el panel (`/`) desde escritorio, móvil o PWA instalada, ve el logotipo completo de **GLOBAL TECH** en el inicio de sesión y configuración inicial, el isotipo oficial en la barra lateral/móvil y el texto actualizado en tarjetas QR y textos de entrega.

**Acceptance Scenarios**:

1. **Given** el operador entra a `/` sin sesión activa, **When** carga `AdminLoginScreen`, **Then** aparece el logotipo completo `logo-global-tech.png` (`GLOBAL TECH · Seguridad Electrónica · Telecomunicaciones`).
2. **Given** se genera una tarjeta QR o resumen de entrega en WhatsApp, **When** se copia o visualiza, **Then** muestra `GLOBAL TECH` en el texto y el emblema oficial centrado en el QR sin romper enlaces ni claves de almacenamiento/Firestore existentes.

## Requirements

- **FR-001**: Centralizar constantes de marca (`BRAND_NAME`, `BRAND_SUBTITLE`, `LOGO_URL`, `BRAND_ICON_URL`) en `src/lib/assets.ts`.
- **FR-002**: Generar desde el logotipo oficial proporcionado por el usuario los recursos gráficos optimizados en `public/` (`logo-global-tech.png`, `global-tech-icon.png`, `og-global-tech.jpg`, `icon.svg`, `favicon.png`, `favicon.jpg`, `apple-touch-icon.png`, `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`).
- **FR-003**: Actualizar metadatos HTML/PWA (`index.html`, `vite.config.ts`, `metadata.json`) y vistas visibles (`AdminLoginScreen.tsx`, `FirstRunSetup.tsx`, `Sidebar.tsx`, `TopNavbar.tsx`, `ClientLivePortal.tsx`, `ClientHandoverCardModal.tsx`, `DesktopProgramModal.tsx`, `WhatsAppTimedShareModal.tsx`, `ShareLinkModal.tsx`, `LiveCameraPlayer.tsx`, `qrGenerator.ts`).
- **FR-004**: Mantener intactos los identificadores técnicos internos de Firestore (`sideseguate_cloud_v1`), `localStorage`/`sessionStorage` y nombres de archivos existentes en servidor (como `/Proyecto-de-Camaras.exe`) para no romper datos en producción ni compatibilidad.
