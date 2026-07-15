## Context

El juego Tiny Tacticians se ejecuta en la plataforma Devvit de Reddit. Los usuarios nuevos experimentan una cinemática de introducción y un tutorial guiado en su primera run. Una vez acuñado su primer general, se marca la fecha en su perfil (`onboardedAt`) y a partir de ese momento cargan directamente la pantalla `Home`.
Para facilitar las pruebas de los moderadores de Reddit, se requiere una opción para volver a activar de manera forzada esta primera run (tutorial/intro), pero restringida únicamente a las cuentas de los moderadores.

## Goals / Non-Goals

**Goals:**
- Permitir a los moderadores del subreddit `/r/tiny_tacticians` volver a jugar la cinemática de introducción y el tutorial.
- Añadir la configuración `enableFirstRunEvent` en Devvit.
- Hacer que la lógica sea transparente para los usuarios normales (su onboarding no debe verse afectado en absoluto).
- Proveer soporte para pruebas locales (desarrollo standalone) sin conexión real a las APIs gRPC de Reddit/Devvit.

**Non-Goals:**
- No se creará una base de datos o almacenamiento independiente de configuración fuera del sistema de settings de Devvit y del Redis existente.
- No se implementará un panel de administración visual propio dentro del juego, sino que se delegará en el panel oficial de configuración de Devvit en Reddit.

## Decisions

### 1. Detección de Moderadores mediante la Reddit API de Devvit
Para determinar de forma segura si un usuario es moderador, se utiliza la API `@devvit/web/server` (`reddit.getCurrentSubreddit()`), llamando a `.getModerators().all()` y buscando coincidencia con `context.userId`.
- *Alternativas consideradas:*
  - Comprobar permisos del usuario en la solicitud (`context.moderator` / `context.permissions`): No se encuentra disponible de forma fiable en todos los contextos gRPC en la versión de Devvit utilizada.
  - Almacenar una lista de IDs de moderadores en Redis: Requiere mantenimiento manual de la lista. Usar la API viva de Reddit es más limpio, robusto y automático.

### 2. Mocking en Entorno de Desarrollo Local
Dado que el servidor local no corre bajo el runtime real de Devvit gRPC y no cuenta con tokens ni contexto real, el sistema adaptará su comportamiento según `isProd`:
- Si `isProd` es falso, la verificación de moderador devuelve `true` para `t2_devuser` o cualquier ID de usuario que comience con `t2_mod`.
- Si `isProd` es falso, la lectura de configuraciones de Devvit (`settings.get`) caerá en Redis local leyendo la clave `mock_setting:enableFirstRunEvent`.
- *Alternativas consideradas:*
  - Fallar silenciosamente o devolver siempre `false`: Haría imposible testear o reproducir la feature en desarrollo local.

## Risks / Trade-offs

- **[Riesgo]** La llamada a `subreddit.getModerators().all()` puede añadir latencia a la carga del perfil (`/api/profile`).
  - *Mitigación:* Esta validación solo ocurre si la opción `enableFirstRunEvent` está activa en la configuración del subreddit. En producción ordinaria, esta configuración estará inactiva (`false`), por lo que la comprobación de moderadores se omite inmediatamente, manteniendo el tiempo de respuesta óptimo para los jugadores normales.
