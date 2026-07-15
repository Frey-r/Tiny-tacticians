## Why

Los moderadores de Reddit del subreddit de Tiny Tacticians necesitan poder experimentar y probar la cinemática de introducción y el tutorial de primera run en cualquier momento desde su cuenta de producción, sin necesidad de crear cuentas nuevas o borrar manualmente sus datos en Redis.

## What Changes

- Se añade una opción de configuración (setting) en Devvit llamada `enableFirstRunEvent` (de tipo booleano, apagada por defecto) visible e interactuable por los moderadores en el panel de control de la app en Reddit.
- Cuando la opción esté activa, el servidor interceptará las solicitudes de perfil de usuario (`GET /api/profile`) de cualquier usuario que sea moderador del subreddit del juego, omitiendo la marca `onboardedAt`.
- Esto causará que el cliente interprete al moderador como un usuario nuevo e inicie directamente el flujo de primera run (cinemática de intro y tutorial de combate).

## Capabilities

### New Capabilities
*(Ninguna)*

### Modified Capabilities
- `meta-progression`: Se altera la forma en que se devuelve el perfil del usuario (`UserProfile`) para soportar la omisión condicional de la propiedad `onboardedAt` en caso de que sea moderador y la opción de configuración esté activa.

## Impact

- `src/server/index.ts`: Registro de la configuración en Devvit.
- `src/server/routes/meta.ts`: Comportamiento de `GET /api/profile` y omisión de `onboardedAt`.
- `src/server/core/moderator.ts` (Nuevo): Lógica para verificar estatus de moderador y consultar settings de Devvit en producción/desarrollo.
