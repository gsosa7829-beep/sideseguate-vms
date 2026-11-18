# Feature Specification: Optimización de Enlaces Activos de Proyecto Ocós y Miniaturas en Vivo

**Feature Branch**: `001-ocos-links-optimization`
**Created**: 2026-11-17
**Status**: Draft
**Input**: User description: "Dejar únicamente funcionando los 4 enlaces individuales de Proyecto Ocós (31778720, 31826717, 31798322, 31822029) y sus TinyURLs ya enviadas, borrar todos los demás enlaces, mantener soporte de vigencia de 3 meses o permanente hasta que se indique inhabilitarlos, optimizar su reproducción y eliminar las miniaturas viejas al pausar."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Catálogo Limpio con los 4 Enlaces Oficiales y Compatibilidad de TinyURLs (Priority: P1)

Como administrador del sistema de videovigilancia, quiero que en la plataforma queden activos únicamente los 4 enlaces oficiales de Proyecto Ocós enviados al cliente (`31778720`, `31826717`, `31798322`, `31822029`) y se eliminen todos los enlaces sobrantes o de prueba, manteniendo operativas las URLs cortas ya compartidas por WhatsApp y el control de vigencia (3 meses o permanente) e inhabilitación desde el panel.

**Why this priority**: Los enlaces enviados por WhatsApp ya están en poder de terceros (municipalidad / contraloría), y tener enlaces duplicados o antiguos en el panel genera confusión y riesgo de accesos no autorizados.

**Independent Test**: Abrir la pestaña de Enlaces del panel y verificar que solo existan los 4 enlaces de Proyecto Ocós, probar cada una de las 4 URLs cortas enviadas y comprobar que cada una abre únicamente su cámara individual asignada, y verificar que pausar o poner permanente uno de esos enlaces desde el panel se refleje al instante en su URL corta y directa.

**Acceptance Scenarios**:

1. **Given** el catálogo de enlaces en la nube y en la consola administrativa, **When** el administrador abre la sección de Enlaces, **Then** aparecen únicamente los 4 enlaces individuales de Proyecto Ocós (`31778720`, `31826717`, `31798322`, `31822029`), sin enlaces `sdg_live_*`, `proyecto-ocos` multipantalla ni `calle-del-cementerio`.
2. **Given** un destinatario que abre cualquiera de las 4 URLs cortas enviadas por WhatsApp (`ocos-instituto-31778720`, `ocos-tabernaculo-31826717`, `ocos-mezquital-31798322`, `ocos-campo-31822029`) o su ruta directa/limpia, **When** carga el portal de cliente, **Then** visualiza únicamente la cámara correspondiente con su ficha informativa oficial y su vigencia (3 meses o permanente), sin barra de administrador.
3. **Given** uno de los 4 enlaces configurado como temporal por 3 meses o como permanente, **When** el administrador lo pausa, lo edita a permanente o lo elimina desde el panel, **Then** el acceso mediante enlace directo o URL corta refleja de inmediato la pausa, la permanencia o la revocación.
4. **Given** un visitante que intenta abrir cualquiera de los enlaces eliminados (por ejemplo `proyecto-ocos` sin cámara específica o `calle-del-cementerio`), **When** carga la página, **Then** recibe el aviso de enlace no disponible y no accede a ninguna transmisión.

---

### User Story 2 - Miniaturas Reales Actualizadas sin Imágenes Históricas Obsoletas (Priority: P1)

Como visitante o administrador que visualiza una cámara en reposo o tras la auto-pausa de ahorro de datos, quiero ver únicamente un fotograma real reciente de esa misma transmisión o un fondo oscuro limpio, y nunca fotografías antiguas de archivo de fechas pasadas.

**Why this priority**: Mostrar una imagen congelada de hace días o semanas con fecha vieja (como `11-01-2026`) confunde al auditor o cliente haciéndole creer que la cámara está atascada o transmitiendo video falso.

**Independent Test**: Abrir cualquiera de los enlaces activos, esperar a que transmita en vivo durante unos segundos y dejar que entre en auto-pausa (o pausar manualmente), verificando que la imagen de fondo corresponda al fotograma recién visto en esa sesión y nunca a una foto histórica de archivo.

**Acceptance Scenarios**:

1. **Given** una cámara que nunca ha reproducido un fotograma reciente en la sesión actual, **When** se muestra en pausa inicial o en reposo, **Then** se presenta un fondo oscuro limpio con el botón de reproducción, sin cargar fotografías estáticas obsoletas de catálogo.
2. **Given** una cámara que ha estado transmitiendo video en vivo, **When** entra en auto-pausa de 1 minuto o el usuario pulsa Pausar, **Then** el sistema captura el último fotograma visible real del flujo activo y lo muestra como vista previa atenuada detrás del botón «Reanudar Transmisión».
3. **Given** una cámara cuya sesión ya tenía una captura previa guardada de una vista anterior, **When** vuelve a reproducir video nuevo en vivo, **Then** la miniatura almacenada se actualiza con el fotograma nuevo y descarta capturas antiguas expiradas.

---

### User Story 3 - Optimización del Portal Público y Salud de Pruebas (Priority: P2)

Como visitante que abre uno de los 4 enlaces desde móvil o PC, quiero que la página cargue rápido, sin reconstrucciones continuas por segundo ni solicitudes de red hacia cámaras ajenas al enlace, y que todas las pruebas automatizadas del proyecto pasen al 100%.

**Why this priority**: Evita desperdicio de batería y datos móviles en celulares 4G, elimina parpadeos o reinicios accidentales del reproductor durante el conteo de vigencia y garantiza que las verificaciones automáticas de calidad vuelvan a estar en verde.

**Independent Test**: Abrir un enlace individual de Ocós en navegador, monitorear las peticiones de red y actividad durante 15 segundos y comprobar que no se consultan otras cámaras distintas a la asignada al enlace, el contador de expiración no provoca reinicios de efectos del reproductor, y la suite de pruebas automatizadas pasa íntegramente.

**Acceptance Scenarios**:

1. **Given** un enlace de cámara individual abierto por un visitante, **When** inicia la página del cliente, **Then** solo se prepara e inicia la transmisión de esa única cámara y nunca se solicitan flujos de cámaras ajenas (como otras calles u otros proyectos).
2. **Given** la vista del cliente abierta durante un minuto o más, **When** avanza el reloj de vigencia del enlace, **Then** la actualización del indicador de tiempo queda aislada sin provocar re-evaluaciones innecesarias del reproductor de video.
3. **Given** la suite de pruebas automatizadas y verificación de compilación del proyecto, **When** se ejecutan los comandos de validación, **Then** el 100% de las pruebas unitarias, verificación de tipos y compilación finalizan sin errores.

### Edge Cases

- ¿Qué ocurre si un navegador ya tenía en caché local la miniatura antigua o los enlaces antiguos (`proyecto-ocos`, `calle-del-cementerio`, `sdg_live_*`)? Al cargar la nueva versión, los enlaces obsoletos y las capturas viejas sin marca de frescura vigente deben quedar purgados automáticamente.
- ¿Qué ocurre si una cámara está temporalmente desconectada en campo (como El Mezquital por cableado) y entra en reposo o intento de reconexión? Debe mostrar su estado claro de reconexión/pausa sobre fondo limpio, nunca una foto antigua de otra cámara ni de otro mes.
- ¿Qué ocurre si el operador abre una ruta limpia (`/31778720`) o URL corta en un navegador donde antes inició sesión de administrador? No debe mostrarse la barra administrativa en enlaces compartidos externos cuando el acceso proviene de rutas de cliente.
- ¿Qué ocurre si el usuario pausa o cambia a «Permanente» uno de los 4 enlaces desde el panel? Los cambios persistidos en la nube deben prevalecer sobre los valores iniciales del código.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El catálogo inicial y el almacenamiento en la nube MUST conservar únicamente los 4 enlaces individuales de Proyecto Ocós (`31778720`, `31826717`, `31798322`, `31822029`) y eliminar todos los demás enlaces existentes previamente (`sdg_live_*`, `proyecto-ocos` multipantalla y `calle-del-cementerio`).
- **FR-002**: El portal de cliente MUST mantener plena compatibilidad con las 4 URLs cortas ya compartidas (`?token=proyecto-ocos&camera=FF9363270`, `FF9363192`, `FF9363285`, `FF9363276`), resolviendo cada una al registro activo del enlace correspondiente (`31778720`, `31826717`, `31798322`, `31822029`) para que obedezcan pausa, vigencia de 3 meses, permanencia o inhabilitación desde el panel.
- **FR-003**: El sistema MUST rechazar el acceso a enlaces eliminados (como `?token=proyecto-ocos` sin parámetro de cámara específica o `?token=calle-del-cementerio`) mostrando el estado de enlace no disponible.
- **FR-004**: El sistema MUST permitir que cada uno de los 4 enlaces se mantenga activo con vigencia de 3 meses o se configure como permanente sin caducidad hasta que el operador lo pause o elimine manualmente.
- **FR-005**: El reproductor de cámara y el muro de video MUST eliminar todas las referencias a miniaturas estáticas históricas de archivo y mostrar en pausa únicamente una captura real reciente de la propia cámara o un fondo neutro oscuro sin imagen.
- **FR-006**: Al reproducir y al pausar video en vivo, el sistema MUST actualizar la miniatura en caché con el fotograma real más reciente de la transmisión activa y descartar capturas almacenadas antiguas de versiones previas o vencidas.
- **FR-007**: El portal de cliente MUST aislar la actualización periódica del texto de caducidad para evitar re-renderizados por segundo en el reproductor y MUST evitar precargas de flujos correspondientes a cámaras que no pertenecen al enlace visitado.
- **FR-008**: La detección de dispositivo propietario para mostrar la barra de vista previa de administrador MUST excluir también las rutas limpias de enlaces compartidos, tratándolas con la misma seguridad que los enlaces con parámetro de token.
- **FR-009**: Los tests automatizados de navegación, resolución de enlaces, aislamiento de rutas limpias y frescura de miniaturas MUST pasar en su totalidad.

### Key Entities *(include if feature involves data)*

- **Enlace Compartido (ShareLink)**: Representa un acceso público individual autorizado para una cámara (`31778720`, `31826717`, `31798322`, `31822029`), con estado (`isActive`), vigencia (`expiresAt`: fecha límite a 3 meses o `null` para permanente), aislamiento de cámara única (`cameraIds`) y permisos de visualización.
- **Captura Reciente de Cámara (CameraCaptureSnapshot)**: Representa la última vista previa visual válida obtenida directamente del flujo real de una cámara, asociada a su serial/canal y marca temporal de captura (`capturedAt`) para invalidar imágenes obsoletas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las 4 URLs cortas enviadas por WhatsApp y sus 4 enlaces directos muestran únicamente la cámara asignada, con vigencia correcta (3 meses o permanente), sin enlaces sobrantes en la nube ni en la vista de Enlaces (4 enlaces totales activos en catálogo).
- **SC-002**: El 0% de los reproductores en pausa o carga inicial muestran fotografías estáticas antiguas (como la captura del `11-01-2026`); tras reproducir video en vivo y pausar, el fondo refleja el fotograma real capturado en la sesión actual.
- **SC-003**: Al abrir un enlace individual de Ocós, se realizan 0 solicitudes de video hacia cámaras ajenas al enlace y los efectos del reproductor permanecen estables sin re-dispararse cada segundo.
- **SC-004**: La verificación de tipos, el 100% de la suite de tests automatizados y la compilación de producción finalizan sin errores ni fallos.

## Assumptions

- Las cámaras físicas y proyectos existentes en el catálogo de equipos (incluidas las cámaras de Ocós y del DVR de Calle del Cementerio) permanecen intactos; solo se depuran los **enlaces compartidos** para dejar activos únicamente los 4 enlaces solicitados.
- La cámara `FF9363285` (Colonia El Mezquital, NOG `31798322`) tiene actualmente una falla física de cableado en campo reportada por el usuario, por lo que su enlace se conserva activo y optimizado en la plataforma para cuando se restablezca la señal en sitio.
- Los 4 enlaces cortos en `tinyurl.com` ya fueron creados externamente apuntando a `?token=proyecto-ocos&camera=...` y no requieren reemitirse para que el cliente siga usando los mismos enlaces de WhatsApp.
