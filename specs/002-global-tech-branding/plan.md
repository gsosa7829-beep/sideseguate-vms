# Implementation Plan: Identidad Visual y Marca GLOBAL TECH

**Branch**: `002-global-tech-branding` | **Date**: 2026-11-18 | **Spec**: [spec.md](spec.md)

## Summary

Generar los activos gráficos oficiales de **GLOBAL TECH** (logotipo horizontal, isotipo cuadrado, tarjeta OpenGraph `1200x630`, favicons e iconos PWA) directamente a partir de la imagen proporcionada por el usuario, centralizar constantes de marca en `src/lib/assets.ts`, y propagar la identidad visual de forma uniforme en la UI administrativa, portal público de clientes, tarjetas QR y metadatos HTML/PWA sin modificar claves internas de Firestore ni `localStorage`.

## Technical Context

- **Language/Framework**: React 19, TypeScript, Vite 8, Tailwind CSS v4, Pillow (generación estática única de iconos)
- **Validation**: `npx tsc --noEmit`, `npm test`, suite completa `tsx --test`, `npm run build`, verificación visual en navegador local/producción Surge (`https://proyectos-de-camaras.surge.sh`)

## Architecture & File Map

- `public/logo-global-tech.png`, `public/global-tech-icon.png`, `public/og-global-tech.jpg`, `public/icon.svg`, favicons/PWA icons
- `src/lib/assets.ts`: constantes únicas `BRAND_NAME`, `BRAND_SUBTITLE`, `LOGO_URL`, `BRAND_ICON_URL`
- `index.html`, `vite.config.ts`, `metadata.json`: títulos, descripciones, tema `#031931`, manifiesto PWA e imagen OpenGraph
- Componentes UI: `AdminLoginScreen.tsx`, `FirstRunSetup.tsx`, `Sidebar.tsx`, `TopNavbar.tsx`, `ClientLivePortal.tsx`, `ClientHandoverCardModal.tsx`, `DesktopProgramModal.tsx`, `WhatsAppTimedShareModal.tsx`, `ShareLinkModal.tsx`, `LiveCameraPlayer.tsx`, `qrGenerator.ts`
