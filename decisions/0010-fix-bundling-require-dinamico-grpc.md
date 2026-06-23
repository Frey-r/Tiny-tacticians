# ADR-0010: Causa raíz del fallo gRPC — `require()` dinámico mal empaquetado (fix `ignoreDynamicRequires`)

## Status
Accepted — 2026-06-23

## Context
Continuación del ADR-0009. Tras (A) quitar el fallback silencioso de Redis y (C) simplificar
`createGamePost`, se desplegó con playtest (`v0.0.1.148`) y el diagnóstico `logDevvitDiag` por fin
mostró el error real. **Resultado decisivo:**

- **El contexto y la auth SÍ llegan bien.** En `/internal/on-install` y `/internal/menu/create-post`
  llegan 11–15 headers `devvit-*` y el contexto resuelve completo:
  `{"subredditId":"t5_ikue7p","subredditName":"tiny_tacticians_dev","userId":"t2_iodrbo8i", …}`.
  → Quedan **descartadas** las hipótesis de "metadata de auth ausente en endpoints internos" y de
  "brecha de auth server-a-servidor" del ADR-0009. El menú interno recibe auth suficiente.

- **El error real es de BUNDLING**, no de plataforma ni de auth:
  ```
  Plugin RPC malformed error - this may be due to a require() statement being
  incorrectly handled by your bundler. Try setting "ignoreDynamicRequires" to true
  in your builder config if using Vite, or a similar option if one is available.
    [cause]: Error: undefined undefined: undefined
      … RedisClient.get → GenericPluginClient.Get → GrpcWrapper.request …
      metadata: _Metadata { internalRepr: Map(0) {}, options: {} }
  ```
  El `metadata: Map(0)` y el `undefined undefined: undefined` que perseguíamos eran **síntomas**:
  los clientes gRPC de Devvit (`reddit`, `redis`) cargan sus *stubs* de plugin mediante `require()`
  **dinámico**. Al empaquetar el servidor con Vite (`@rollup/plugin-commonjs`), esos require se
  reescriben y quedan malformados → la llamada gRPC sale sin método/metadata válidos → el host la
  rechaza. "status code 36" en el navegador era el HTTP 400 del handler mangled por el gateway
  (ver ADR-0009).

### Por qué nuestro build lo provocaba y el oficial no
El template oficial `reddit/devvit-template-react` construye con **un único plugin**
`devvit()` de `@devvit/start/vite` (`plugins: [react(), tailwind(), devvit()]`), que sabe empaquetar
el servidor para el runtime de Devvit (qué inlinear y qué dejar como require de runtime). Nuestro
proyecto hace un **build manual** en `vite.config.server.ts` (`ssr.noExternal: true`, `lib` CJS,
`inlineDynamicImports`) — necesario para evitar "Cannot find module" con los imports estáticos
(ver [[devvit-server-bundle-self-contained]]), pero que por defecto rompía los require dinámicos.

## Decision
Mantener el build manual y añadir la opción que el propio error de Devvit recomienda:

```ts
// vite.config.server.ts
build: {
  ssr: true,
  commonjsOptions: { ignoreDynamicRequires: true }, // ← fix
  …
}
```

- `ssr.noExternal: true` sigue empaquetando los imports **estáticos** (express, @devvit/web/server, …).
- `commonjsOptions.ignoreDynamicRequires: true` deja los `require()` **dinámicos** como `require()`
  nativos, que el runtime de Devvit resuelve. Ambas opciones son **complementarias**, no opuestas.

## Consequences
- Esperado: las llamadas `reddit.*`/`redis.*` dejan de fallar con `Plugin RPC malformed` /
  `Map(0)`; el post se crea desde el trigger `onAppUpgrade` y desde el menú; `seedNPCs` persiste.
- Confirmar tras re-desplegar (`npm run build` → `npm run playtest`) que `devvit logs` ya no
  muestra `Plugin RPC malformed` y que el post aparece en r/tiny_tacticians_dev.
- Una vez verde: quitar el andamiaje de diagnóstico (`logDevvitDiag`, `GET /internal/test-post`,
  `POST /api/create-post`) y, opcionalmente, el `diag.ts`.

## Alternatives considered
- **Migrar a `@devvit/start/vite` (`devvit()` plugin)** como el template oficial: es el camino
  canónico y elimina por completo el build manual. Más robusto a futuro, pero es un cambio grande
  de toolchain (requiere `@devvit/start`, reestructura client+server, dev.mjs/IS_DEV). Se difiere:
  si `ignoreDynamicRequires` resuelve, no es urgente; si no, es el siguiente paso.
- **Migrar Express→Hono (ADR-0009 §D)**: **descartado como causa**. El diagnóstico probó que el
  contexto y los headers llegan correctamente con Express; el fallo era 100% de bundling. No aporta
  al fix.
- **Externalizar los @devvit del bundle**: rompe con "Cannot find module" en runtime. Rechazado
  (ver [[devvit-server-bundle-self-contained]]).
