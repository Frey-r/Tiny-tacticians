# ADR-0009: Diagnóstico del fallo de creación de post y plan de remediación

## Status
Proposed — 2026-06-23

## Context
La app no logra publicar el custom post jugable en el subreddit. Tras un día de iteración, el
diagnóstico (logs `[diag:*]` de `src/server/core/diag.ts`, `devvit logs`, y los comentarios de
`meta.ts`/`devvitInternal.ts`) ha descartado varias pistas falsas y acotado el problema.

### Qué se DESCARTÓ (no perder más tiempo aquí)
- **No falta montar Redis ni una API key.** Redis es gestionado por Devvit; la auth viaja como
  metadata por request. Ver **ADR-0008**.
- **"status code 36" es un síntoma, no la causa.** El error de navegador
  `ContextAction/OnAction INTERNAL: Received invalid status code from server: 36` aparece porque
  el handler de menú captura el fallo de `reddit.submitCustomPost`, responde **HTTP 400**, y el
  gateway de Devvit transforma ese 400 en el código gRPC falso `36`. No es un código real.
- **El parser de body manual NO es la causa.** Se probó empíricamente que AsyncLocalStorage
  sobrevive a `await once(req,'end')`. El cambio de parser es ortogonal al fallo.
- **Auto-empaquetar el server (`noExternal:true` → `dist/server/index.cjs`) es el flujo correcto**
  de Devvit; la CLI solo verifica que el archivo exista, no recompila. Ver
  [[devvit-server-bundle-self-contained]] en notas del proyecto.

### Qué se CONFIRMÓ
- **Bug `isDev` (ya corregido).** El HEAD anterior calculaba
  `isDev = IS_DEV==='true' || !process.env.NODE_ENV || …`, que en producción (donde Devvit no
  define `NODE_ENV`) daba **true** → se saltaba `createServer` → `"No context found"` garantizado.
  La corrección `const isDev = process.env.IS_DEV === 'true'` (ya en `index.ts`) hace que
  `createServer` corra y **elimina el `"No context found"`**. Ver ADR-0002 y la nota
  [[devvit-runtime-no-node-env]].

### El problema que QUEDA (causa raíz viva)
Con `createServer` corriendo, el contexto **existe**, pero al llamar a `reddit.*`/`redis.*` desde
endpoints `/internal/*` (menú y triggers, server-a-server) el cliente gRPC falla con
`"undefined undefined: undefined"` y **`metadata: Map(0){}`** — es decir, **la metadata de
autenticación llega vacía**. Mecanismo (verificado en `node_modules/@devvit`):

1. `@devvit/server/create-server.js`: por cada request construye `Context(req.headers)` a partir
   de los headers `devvit-*` y corre el handler dentro de `runWithContext(…)` (AsyncLocalStorage).
2. `@devvit/reddit/RedditClient.js` y el cliente de Redis autentican leyendo `context.metadata`.
3. Si los headers `devvit-*` no llegan en el request, `context.metadata` queda como `Map(0){}` y
   el host rechaza la llamada → `"undefined undefined: undefined"`.

Pregunta abierta: **¿los requests a `/internal/*` (menú/trigger) llegan con los headers
`devvit-*` de auth, o llegan sin ellos?** El template oficial `reddit/devvit-template-react` crea
el post desde `/internal/menu/post-create` y **funciona**, luego el menú server-a-server *debe*
recibir auth suficiente. Si en nuestro caso no la recibe, es un problema de **configuración o de
versión/manifiesto de la app**, no una limitación de la plataforma.

### Enmascaramiento que nos dejó "a ciegas"
En producción, el proxy `redis` cae **en silencio** a `InMemoryRedis` ante estos fallos
(`devvitRedisProxyWithFallback`). Resultado: el juego "parece" funcionar pero **pierde todos los
datos** entre isolates y no emite error. `reddit` no tiene fallback, por eso el menú es el único
fallo visible. Esto es justo lo que ocultó la causa durante un día.

## Decision
Plan de remediación, por prioridad:

### A. Hacer ruidoso el fallo (inmediato)
- En **producción**, `redis` NO debe caer en silencio a `InMemoryRedis`: que el error propague y
  se vea en `devvit logs`. El fallback in-memory se restringe a dev/test. (Contradice la
  aplicación del principio "errores tolerantes" del ADR-0007 a la **capa de transporte**: tolerar
  un campo corrupto es válido; tolerar en silencio que Redis no existe, no.)

### B. Ejecutar la comparación de headers con `diag.ts` (paso decisivo)
- `logDevvitDiag` ya está en `/internal/menu/create-post`, `/internal/on-install` y `/api/profile`.
  Redesplegar, **cargar el juego** (dispara `api/profile`, ruta de cliente) y **pulsar el menú**
  (ruta interna), y comparar en `devvit logs` qué headers `devvit-*` llegan en cada una:
  - Si la ruta de cliente trae headers de auth y la interna **no** → brecha de auth específica de
    endpoints internos (configuración/manifiesto). Reportar en r/Devvit con esos logs.
  - Si **ambas** fallan igual → problema global de bundle/transporte.

### C. Simplificar la creación del post al patrón canónico
- Reducir `createGamePost` a lo que usa el template oficial:
  `reddit.submitCustomPost({ title })` (subreddit y `runAs: APP` por defecto desde el contexto).
  Quitar el fallback `runAs: USER → APP`, `textFallback` y `userGeneratedContent` salvo necesidad
  explícita. Menos superficie = menos modos de fallo y un error más limpio en logs.
- Eliminar código muerto de diagnóstico una vez resuelto (`runRedditDiagnostics`,
  `GET /internal/test-post`, `POST /api/create-post`).

### D. (Opcional) Alinear el framework con el template oficial
- El template usa **Hono** + `@hono/node-server` (`serve({ fetch, createServer, port })`) en lugar
  de Express. No es la causa del fallo actual (el parser ya se descartó), pero alinear reduce la
  divergencia con un setup que se sabe que funciona. Evaluar **solo si** B no resuelve.

### E. Verificación
- Tras A–C: `npm run build` → `upload`/`playtest`, instalar en el subreddit, pulsar el menú y
  comprobar que el post aparece y que `devvit logs` ya no muestra `undefined undefined` ni
  `metadata: Map(0)`.

## Consequences
- Se recupera visibilidad del error real (fin del "a ciegas").
- El paso B distingue de forma definitiva entre "bug de configuración/manifiesto de la app" y
  "bug de plataforma", que es lo que hoy no sabemos.
- La creación de post queda idéntica a la de un template que funciona, aislando cualquier residuo
  a instalación/permisos.

## Alternatives considered
- **Normalizar el parche `POST /api/create-post` (crear el post desde el cliente)**: ya se probó;
  sirve como diagnóstico, pero el template oficial demuestra que el menú `/internal` debe
  funcionar. No adoptarlo como solución definitiva.
- **Asumir Redis/API key faltante**: descartado en el ADR-0008.
- **Culpar al parser de body o a Express**: descartado empíricamente; no invertir ahí salvo que B
  lo señale.
