# ADR-0008: Redis y servicios gestionados por Devvit (sin hosting ni API keys externas)

## Status
Accepted — 2026-06-23

## Context
Tras un día entero intentando que la app publique el post jugable en el subreddit, surgió la
duda de si el problema venía de Redis: ¿hay que **montar un servidor Redis**? ¿falta una **API
key** o un secreto que no tenemos? Esta nota deja la respuesta por escrito para no volver a
perder tiempo en esa pista.

### Cómo se accede hoy a Redis en el código
`src/server/devvitProxy/index.ts` expone un único `redis` que conmuta según el entorno:

- **Producción (runtime Devvit)** → `devvitRedisProxyWithFallback`, que delega en
  `@devvit/web/server` (`webServer.redis.*`). Ese es el **Redis gestionado por Devvit**.
- **Dev local (`IS_DEV=true`, lo pone `scripts/dev.mjs`)** → `localRedisProxy`, que usa
  `ioredis` contra `REDIS_URL` (o `redis://localhost:6379`) y, si no conecta, cae a un
  `InMemoryRedis` en memoria.
- **Tests (`NODE_ENV=test`)** → `InMemoryRedis`.

## Decision

### 1. Redis es un servicio **gestionado por Devvit**. No montamos nada.
En producción NO hospedamos Redis, NO hay `REDIS_URL`, NO hay contraseña ni endpoint propio.
El cliente Redis se obtiene de `@devvit/web/server` y la plataforma enruta cada operación a su
almacén gestionado, autenticando con la metadata que el runtime inyecta por request (ver
ADR-0002 y el ADR-0009). El permiso se declara en `devvit.json` con `"permissions": { "redis": true }`.

### 2. No se necesita ninguna API key externa — ni para Redis ni para la Reddit API.
La autenticación de **todas** las llamadas gestionadas (`redis.*`, `reddit.*`) viaja como
metadata (`devvit-*` headers) que el host adjunta a cada request y que los clientes gRPC leen
de `context.metadata` (AsyncLocalStorage). No hay `client_id`/`client_secret` de Reddit, ni
token de Redis, que debamos guardar. Lo único que se requiere para operar:

1. `devvit login` en la CLI (autenticación del desarrollador para `upload`/`playtest`).
2. La app subida/creada bajo la cuenta de Reddit.
3. La app **instalada** en el subreddit de pruebas.

Si en el futuro se usan *secrets* de app (p. ej. una API de terceros), se declararían como
**app settings/secrets** en el panel de Devvit, no como variables de entorno del bundle.

### 3. `ioredis` y `REDIS_URL` son **solo** andamiaje de dev local. No pertenecen al camino de prod.
La dependencia `ioredis` y la rama `localRedisProxy` existen para poder correr el servidor
fuera de Devvit (`npm run dev`). En producción nunca se ejecutan. Se mantienen aislados tras
`isProd`/`isDev`, y su presencia **no** implica que haya que montar Redis para desplegar.

## Consequences
- Queda descartada la hipótesis "falta montar Redis / falta una API key" como causa del fallo
  de publicación. La causa real se trata en el **ADR-0009**.
- El `InMemoryRedis` como *fallback* es cómodo en dev pero **peligroso si se activa en prod**:
  enmascara fallos del Redis gestionado y rompe la persistencia entre invocaciones (ver
  ADR-0009, donde se decide no enmascarar el error en producción).
- Si algún día se quita el modo dev standalone, se puede eliminar `ioredis` del `package.json`
  sin afectar al despliegue.

## Alternatives considered
- **Montar un Redis propio (Upstash, Redis Cloud, etc.) y conectarlo por `REDIS_URL`**:
  innecesario y, de hecho, no soportado dentro del sandbox de Devvit Web, que solo expone su
  Redis gestionado. Rechazado.
- **Gestionar credenciales de la Reddit API manualmente**: contradice el modelo de Devvit, que
  inyecta la auth por request. Rechazado.
