# Auditoría completa — SIDESEGUATE VMS

Fecha: 2026-10-29 · Rama `arena/a9d81b4c-sideseguate-vms`
Base auditada: `1819adc` (merge del PR #4)

---

## Resumen ejecutivo

Se auditaron **15 597 líneas** en 47 archivos (11 vistas, 22 componentes, 19 módulos de librería).

| Área | Encontrado | Corregido | Pendiente |
|---|---|---|---|
| Seguridad | 6 | 2 críticos | 4 |
| Enlaces rotos | 3 | 3 | 0 |
| Errores / código muerto | 5 | 1 | 4 |
| Interfaz móvil | 4 | 3 | 1 |
| Rendimiento / PWA | 3 | 1 | 2 |

**Estado del proyecto:** `tsc` limpio · **43/43 tests** · build OK (2,1 MB, PWA 40 entradas).

> El hallazgo más grave no era visual: **las contraseñas de los DVR eran legibles
> públicamente en internet**. Ya está corregido.

---

## 1. Seguridad

### 🔴 CRÍTICO — Credenciales del DVR públicas en Firestore *(CORREGIDO)*

**Qué pasaba.** Cada cámara se sincronizaba a la nube con estos campos:

```js
username: 'vi1fdr',
password: 'Dvr232323',                    // ← texto plano
rtspUrl: 'rtsp://vi1fdr:Dvr232323@…',     // ← credenciales embebidas
verificationCode: 'HELGDM',
```

Y las reglas de Firestore autorizan sin autenticación:

```
function isAuthorizedOperator(ownerId) {
  return isValidId(ownerId) && (
    isTenantOwnerId(ownerId) ||            // ← incluye 'sideseguate_cloud_v1'
    …
```
```
allow get:  if isValidId(cameraId) && (resource == null || isAuthorizedOperator(existing().ownerId));
allow list: if isAuthorizedOperator(existing().ownerId);
```

**Consecuencia.** Cualquiera con el `projectId` —que viaja en el JavaScript
público— podía listar `cloud_cameras` y leer **todas las contraseñas de todos los
DVR**, sin registrarse. Un `curl` a la API REST de Firestore bastaba.

**Corrección aplicada.**
- `toCloudCameraPayload()` ya no incluye `username`, `password`, `rtspUrl` ni
  `verificationCode`. Esos datos solo viven en el `localStorage` del operador.
- `firestore.rules`: los campos salen de `hasAll`/`hasOnly`, así que tampoco se
  pueden volver a escribir.
- `App.tsx`: al recibir cámaras desde la nube se **re-aplican los secretos
  locales**, para que la sincronización no deje las cámaras sin credenciales.
- Test de regresión: falla si algún secreto reaparece en el payload.

**Verificado:** `JSON.stringify(payload)` no contiene ni `Dvr232323`, ni `vi1fdr`,
ni `VERIF-DEMO`.

### 🟠 ALTO — Escritura sin autenticación *(PENDIENTE)*

El mismo mecanismo permite **crear, modificar y borrar** cualquier documento:

```
allow create: if … isValidCloudCamera(incoming()) …   // sin auth real
allow delete: if isValidId(cameraId) && isAuthorizedOperator(existing().ownerId);
```

Cualquier visitante puede borrar todas las cámaras o inyectar enlaces falsos.
**No es corregible con reglas solamente**: la app no usa Firebase Auth, así que
las reglas no tienen a quién preguntar. Ver §6 para el plan.

### 🟡 MEDIO — Resto de vectores

| # | Hallazgo | Estado |
|---|---|---|
| 1 | `innerHTML`, `eval`, `dangerouslySetInnerHTML` | ✅ ninguno |
| 2 | `target="_blank"` sin `rel="noopener"` | ✅ todos llevan `rel` |
| 3 | Credenciales hardcodeadas en `src/` | ✅ ninguna (CI lo bloquea) |
| 4 | `localStorage` para la cuenta admin | ⚠️ aceptable (PBKDF2-SHA256, sin servidor) |
| 5 | Sin CSP ni cabeceras de seguridad | ❌ pendiente |
| 6 | `webrtcAllowOrigins: ['*']` en MediaMTX | ❌ pendiente |

---

## 2. Enlaces

### 🔴 Enlaces de cliente apuntando a `localhost` *(CORREGIDO)*

Los enlaces para clientes se construían así:

```js
const baseUrl = window.location.origin + window.location.pathname;
```

Si el operador generaba el enlace desde `localhost:3000` o desde el preview, el
mensaje de WhatsApp que recibía el cliente era:

```
http://localhost:3000/?token=sdg_live_…
```

**En el celular del cliente eso no abre nada.** Y el campo "Dominio público de la
plataforma" existía en la configuración… pero **no se usaba en ningún sitio**.

**Corrección.** Nuevo `src/lib/publicUrl.ts` con prioridad:
1. Dominio configurado en *Servidor de video → Dominio público de la app*.
2. Origen actual si es público (https + host con dominio).
3. Origen actual marcado como `preview` → **se avisa en pantalla**.

Además, aviso visible en *Enlaces Privados* cuando el enlace no saldrá del equipo,
y `buildPublicShareUrl()` aplicado a copiar, WhatsApp, QR y ficha de entrega.

### 🔴 Logo roto en GitHub Pages *(CORREGIDO)*

`vite.config.ts` usa `base: './'` porque GitHub Pages sirve en
`/sideseguate-vms/`. Vite reescribe las rutas de `index.html`, **pero no las
escritas dentro del código React**:

```jsx
<img src="/logo-sideseguate.jpg" />   // → https://…github.io/logo-sideseguate.jpg → 404
```

Afectaba a **6 sitios** (Sidebar, portal del cliente, ficha de entrega, onboarding).

**Corrección.** Nuevo `src/lib/assets.ts` con `assetUrl()` / `LOGO_URL`, que
respeta `import.meta.env.BASE_URL`. Verificado en el bundle final.

### 🔴 Botón "Descargar ZIP" roto *(ELIMINADO)*

```jsx
href="/SIDESEGUATE-Streaming-Proyecto-Completo.zip"   // el archivo no existe en public/
```

Visible en la barra superior de **todas** las vistas → 404 garantizado. Se eliminó
(regla del proyecto: nada que no funcione).

### ✅ Revisado sin problemas

- Los 7 `target="_blank"` llevan `rel="noopener noreferrer"`.
- Los enlaces de WhatsApp (`wa.me`) están bien formados y normalizan el teléfono.
- `?token=` y `?tenant=` se parsean de forma segura.

---

## 3. Errores y código innecesario

| # | Hallazgo | Acción |
|---|---|---|
| 1 | `MobileSimulatorModal` (354 líneas): un iPhone falso dentro de la app para "previsualizar". No aporta al cliente final. | ❌ Recomendado eliminar |
| 2 | `ZeroStorageView` + `ArchitectureTab` (825 líneas) son documentación comercial dentro del panel. | ⚠️ Mover a una sección "Ayuda" |
| 3 | 11 vistas en el menú; en móvil solo 4 accesibles desde la barra inferior (el resto vía hamburguesa). | ⚠️ Reagrupar |
| 4 | `LiveCameraPlayer.tsx` con 1 060 líneas: canvas, HLS, P2P, iVMS, PTZ y watermark en un archivo. | ❌ Dividir |
| 5 | Estado inicial de `cloudP2pClient` anunciaba 4 canales conectados con métricas inventadas. | ✅ corregido antes |

Sin errores de compilación, sin `TODO`/`FIXME` sueltos, sin `console.log` de depuración
en producción (solo `console.warn` legítimos).

---

## 4. Interfaz y móvil

### 🔴 Texto ilegible en móvil *(CORREGIDO)*

**280 usos** de tamaños por debajo del mínimo legible:

| Tamaño | Usos |
|---|---|
| `text-[11px]` | 187 |
| `text-[10px]` | 88 |
| `text-[10.5px]` | 5 |

En un teléfono eso obliga a hacer zoom. **Corrección:** capa de CSS que eleva el
piso **solo por debajo de 768px** (11,5 px y 12,5 px), sin tocar la densidad de
escritorio.

### 🟠 Área táctil y zoom de iOS *(CORREGIDO)*

- 19 botones de solo icono con `p-1`/`p-1.5` (~28 px) → ahora mínimo **40 px**.
- Inputs con `font-size` < 16 px provocan el zoom automático de iOS al enfocar →
  forzado a 16 px en móvil.

### 🟡 Pendiente de diseño móvil

| # | Problema | Recomendación |
|---|---|---|
| 1 | Barra inferior con 4 de 11 vistas; el resto queda escondido tras la hamburguesa | Barra de 5 con "Más" |
| 2 | `MobileSimulatorModal` con ancho fijo `w-[340px]` desborda en pantallas de 320-360 px | Eliminar el componente |
| 3 | 54 `whitespace-nowrap` pueden provocar scroll horizontal | Revisar los de cabeceras |
| 4 | El muro de vídeo en vertical desaprovecha pantalla | Forzar 2 columnas en `<640px` |

---

## 5. Rendimiento / PWA

| Métrica | Valor |
|---|---|
| Bundle total | 2,1 MB (gzip ≈ 620 KB) |
| `vendor-video` (hls.js) | 566 KB — **bajo demanda**, correcto |
| `vendor-firebase` | 548 KB — se carga siempre |
| Precachel PWA | 40 entradas / 1,97 MB |

- ✅ Lazy loading en las 11 vistas.
- ✅ Imágenes ahora precacheadas (`globPatterns` incluía solo `png`/`svg`).
- ⚠️ **Firebase se carga en el arranque aunque el usuario nunca abra la nube.**
  Candidato a importación dinámica: −548 KB en la primera carga.
- ⚠️ Sin `sizes`/`loading="lazy"` en imágenes del logo (menor).

---

## 6. Plan recomendado

### P0 — Antes de dar acceso a clientes

1. **Publicar `firestore.rules`** en la consola de Firebase. Incluye el esquema
   nuevo (sin credenciales) y `tenantId`/`deviceSerial`. *(Sin esto, los cambios
   de seguridad no se aplican.)*
2. **Rotar las contraseñas de los DVR** que ya se hayan sincronizado. Estuvieron
   públicas; asumir que están comprometidas es lo correcto.
3. **Limpiar los documentos antiguos** de `cloud_cameras` que aún tienen
   `password`, `rtspUrl` y `verificationCode` guardados.

### P1 — Autenticación real en la nube (cierra la escritura pública)

Opción recomendada: **Firebase Auth anónimo** al abrir el panel + reglas que
exijan `request.auth != null` para escribir, dejando lectura pública solo de los
campos que el portal necesita (nombre, estado, HLS).

Alternativa más estricta: cuenta de servicio con un endpoint propio. Más trabajo,
pero sin exponer la base.

### P2 — Producto

- Eliminar `MobileSimulatorModal`; reagrupar las 11 vistas en 5 secciones.
- Dividir `LiveCameraPlayer` (canvas / HLS / P2P / PTZ en módulos).
- Carga diferida de Firebase.
- Cabeceras de seguridad (CSP) y `webrtcAllowOrigins` restringido.
- PWA: pulir iconos y pantalla de arranque en iOS.

---

## Anexo — Comandos de verificación

```bash
npx tsc --noEmit          # limpio
npm test                  # 43/43
npm run build             # 2,1 MB · PWA 40 entradas
grep -rn "Sideseguate2026\|Ing2026\|Dvr232323\|Monitor2026\|HELGDM" src/   # sin resultados
```
