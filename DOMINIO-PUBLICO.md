# Dominio público: que el cliente vea tu marca, no tu nombre

## El problema

El enlace que recibe el cliente se construye con el dominio desde el que está
abierto el panel. Según dónde esté alojada la app, ese dominio puede ser:

| Alojamiento | Enlace que recibe el cliente | ¿Se ve bien? |
|---|---|---|
| GitHub Pages | `https://gsosa7829-beep.github.io/sideseguate-vms/?token=…` | ❌ Muestra tu usuario de GitHub y el nombre interno del repo |
| Surge | `https://sideseguate-cloud.surge.sh/?token=…` | ⚠️ Muestra la marca, pero con «-cloud» y el nombre de la plataforma |
| Dominio propio | `https://camaras.sideseguate.com/?token=…` | ✅ Solo tu marca |
| Preview / local | `http://localhost:3000/?token=…` | ❌ No abre en el celular del cliente |

El código ya no puede evitar el problema por sí solo: el nombre aparece en el
**dominio**, y eso se decide en el alojamiento y en el DNS. Lo que sí hace la
app (a partir de ahora) es no usar nunca el origen crudo si hay un dominio de
marca configurado, y **avisarte en el panel** cuando el enlace va a mostrar tu
usuario personal.

## Cómo fijar el dominio de marca (una sola vez)

### Paso 1. Elige y consigue el dominio

- **Opción A — Surge, subdominio de marca (gratis, 1 minuto).**
  Surge permite elegir el subdominio. Crea la variable `SURGE_DOMAIN` con valor
  `sideseguate.surge.sh` y el workflow publicará ahí. No hay DNS que tocar.
- **Opción B — Dominio propio sobre Surge (plan Pro de Surge).**
  En Surge, dominio personalizado `camaras.sideseguate.com` + registro `CNAME`
  en tu proveedor apuntando a `sideseguate-cloud.surge.sh`.
- **Opción C — Dominio propio sobre GitHub Pages (gratis).**
  1. En el repo: **Settings → Pages → Custom domain** → `camaras.sideseguate.com`.
  2. En tu proveedor de dominio, registro `CNAME` para `camaras` apuntando a
     `gsosa7829-beep.github.io`.
  3. Cuando verifique, activa **Enforce HTTPS**.

### Paso 2. Dile a la app qué dominio usar

En el repo: **Settings → Secrets and variables → Actions → pestaña Variables →
New repository variable**

| Variable | Valor de ejemplo | Para qué |
|---|---|---|
| `PUBLIC_APP_URL` | `https://camaras.sideseguate.com` | Dominio que llevan **todos** los enlaces de cliente |
| `SURGE_DOMAIN` | `sideseguate.surge.sh` | Dónde publica el workflow de Surge |

Se hornean al compilar (`VITE_PUBLIC_APP_URL`), así que funcionan en cualquier
dispositivo sin configurar nada a mano. Después del siguiente despliegue, los
enlaces nuevos ya llevan tu dominio.

### Paso 3. Alternativa sin tocar GitHub

Dentro del panel: **Servidor de video → «Dominio público de la plataforma»**.
Ese valor manda sobre todo lo demás, pero se guarda **en el navegador de ese
equipo**: si generas enlaces desde otro PC o desde el móvil, tendrás que
escribirlo otra vez. Para eso está la variable del paso 2.

## Cómo comprobar que quedó bien

1. Abre el panel → pestaña de enlaces. Si ves el aviso amarillo *«Tus enlaces
   muestran tu usuario personal»*, todavía falta configurar el dominio.
2. Genera un enlace y revisa la URL completa antes de enviarla.
3. Abre esa URL en el móvil (con datos, no Wi-Fi): debe cargar el portal del
   cliente.

## Notas

- Cambiar el dominio **no invalida** los enlaces antiguos: los tokens siguen en
  Firestore y funcionan con cualquier dominio que sirva la app.
- Si cambias de alojamiento, actualiza `PUBLIC_APP_URL` y vuelve a desplegar.
- El QR y el mensaje de WhatsApp usan la misma base, así que se corrigen a la
  vez.
