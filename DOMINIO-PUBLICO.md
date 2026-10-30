# Dominio público: que el cliente vea tu marca, no tu nombre

## El problema

El enlace que recibe el cliente se construye con el dominio desde el que está
abierto el panel. Según dónde esté alojada la app, ese dominio puede ser:

| Alojamiento | Enlace que recibe el cliente | ¿Se ve bien? |
|---|---|---|
| GitHub Pages | `https://gsosa7829-beep.github.io/sideseguate-vms/?token=…` | ❌ Muestra tu usuario de GitHub y el nombre interno del repo |
| **Surge (actual)** | `https://sideseguate-streaming.surge.sh/?token=…` | ✅ Solo la marca (el sufijo `.surge.sh` es del alojamiento) |
| Dominio propio | `https://camaras.sideseguate.com/?token=…` | ✅ Solo tu marca |
| Preview / local | `http://localhost:3000/?token=…` | ❌ No abre en el celular del cliente |

> **Dominio de producción vigente:** `https://sideseguate-streaming.surge.sh`.
> El antiguo `sideseguate-cloud.surge.sh` quedó obsoleto y sirve una versión
> anterior del panel: no lo uses ni lo compartas.

El código ya no puede evitar el problema por sí solo: el nombre aparece en el
**dominio**, y eso se decide en el alojamiento y en el DNS. Lo que sí hace la
app (a partir de ahora) es no usar nunca el origen crudo si hay un dominio de
marca configurado, y **avisarte en el panel** cuando el enlace va a mostrar tu
usuario personal.

## Cómo fijar el dominio de marca (una sola vez)

### Paso 1. Elige y consigue el dominio

- **Opción A — Surge, subdominio de marca (gratis, 1 minuto).**
  Surge permite elegir el subdominio. Crea la variable `SURGE_DOMAIN` con valor
  `sideseguate-streaming.surge.sh` y el workflow publicará ahí. No hay DNS que
  tocar. Es la opción en uso.
- **Opción B — Dominio propio sobre Surge (plan Pro de Surge).**
  En Surge, dominio personalizado `camaras.sideseguate.com` + registro `CNAME`
  en tu proveedor apuntando a `sideseguate-streaming.surge.sh`.
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
| `PUBLIC_APP_URL` | `https://sideseguate-streaming.surge.sh` | Dominio que llevan **todos** los enlaces de cliente |
| `SURGE_DOMAIN` | `sideseguate-streaming.surge.sh` | Dónde publica el workflow de Surge |

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

## Qué NO se puede borrar: las URLs de GitHub del video en vivo

Viendo el código puede parecer que `src/lib/cloudP2pClient.ts` conserva «restos»
del antiguo despliegue de GitHub:

```
https://raw.githubusercontent.com/gsosa7829-beep/sideseguate-vms/cloud-state/endpoint.json
https://cdn.jsdelivr.net/gh/gsosa7829-beep/sideseguate-vms@cloud-state/endpoint.json
https://raw.githack.com/gsosa7829-beep/sideseguate-vms/cloud-state/endpoint.json
```

**No son restos y no se deben borrar.** Son el canal por el que llega la
dirección del túnel del DVR:

1. El runner (`cloud-p2p-runner.ps1`) corre en GitHub Actions, levanta un túnel
   de Cloudflare y **cada arranque obtiene un nombre aleatorio**.
2. Publica esa dirección en la rama `cloud-state` mediante la API de GitHub.
3. El navegador del cliente la descubre leyendo esas tres URLs (tres por
   redundancia: si una CDN falla o limita, quedan las otras).

Se usan sólo para buscar la dirección del túnel. **Nunca aparecen en el enlace
que recibe el cliente ni en la interfaz**; como mucho se ven en la pestaña Red
del navegador.

El dominio de Surge **no puede sustituirlas**: es alojamiento estático y no
regenera ese archivo cuando el túnel cambia de nombre. Si se eliminan, sólo
quedan los dos túneles fijos escritos en el código, que mueren al reiniciarse el
runner: los enlaces abren, pero **las cámaras dejan de cargar**.

Si algún día se quiere dejar de depender de GitHub, hay que sustituir el canal
primero (por ejemplo un proxy propio con dominio de marca que sirva
`/p2p/endpoint.json`) y sólo después borrar estas URLs.

## Desplegar en Surge (el dominio `sideseguate-streaming.surge.sh`)

El dominio **solo se actualiza si el workflow tiene el secreto `SURGE_TOKEN`**.
Si falta, el run ahora **falla en rojo** con el mensaje *«Falta el secreto
SURGE_TOKEN»* (antes terminaba en verde sin publicar nada, y así se quedó
semanas atrás).

### Una sola vez

```bash
npx --yes surge login     # tu correo y contraseña de Surge
npx --yes surge token     # copia el token completo que imprime
```

Repo → **Settings → Secrets and variables → Actions → New repository secret**

- Nombre: `SURGE_TOKEN`
- Valor: el token del paso anterior

Después: **Actions → Deploy to Surge → Run workflow**. A partir de ahí, cada
fusión a `main` publica sola.

### O inmediato, desde tu PC

```bash
git pull && npm ci && npm run deploy:surge
```

### Comprobar que de verdad se publicó

El estado del run no basta: un run verde no garantiza nada si el token falta.

```bash
npm run build && npm run verify:deploy
```

Compara el asset que sirve el dominio con el que acabas de compilar. También lo
hace el propio workflow en el paso *«Verificar que el dominio sirve el build
nuevo»*: si el sitio queda viejo, el run falla.
