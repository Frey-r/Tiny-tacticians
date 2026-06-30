import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './src/shared'),
      '@server': path.resolve(__dirname, './src/server'),
    },
  },
  // Devvit deploys ONLY this server bundle — there is no node_modules at runtime,
  // and the host resolves NOTHING by name except Node built-ins (proven: leaving
  // `express` external crashed, then `@devvit/web/server` crashed next). So the
  // bundle must be fully self-contained: `noExternal: true` bundles every dependency
  // (express, ioredis, @devvit/web/server and its @devvit/* + protobufjs deps).
  // Node built-ins are still auto-externalized by Vite's SSR/node build.
  ssr: {
    noExternal: true,
    // `ioredis` es SOLO para dev (proxy Redis local). En prod no se usa nunca
    // (la rama isDev no corre) y Devvit aporta su Redis gestionado. Externalizarlo
    // lo saca del bundle (~cientos de KB): el único `require('ioredis')` que queda
    // está tras un import() dinámico en la rama dev, que prod jamás ejecuta.
    external: ['ioredis'],
  },
  build: {
    ssr: true,
    // Los clientes gRPC de Devvit (reddit/redis) cargan sus stubs de plugin con
    // `require()` DINÁMICO. Por defecto, @rollup/plugin-commonjs intenta reescribir
    // esos require y los deja malformados → el host responde "Plugin RPC malformed
    // error … require() statement being incorrectly handled by your bundler" y la
    // metadata gRPC llega vacía (`Map(0)`), que era el fallo real de creación de post.
    // `ignoreDynamicRequires` los deja como require() nativos que el runtime de Devvit
    // resuelve. Compatible con `ssr.noExternal: true` (eso empaqueta los imports
    // ESTÁTICOS; esto preserva los require DINÁMICOS). Ver decisions/0009 y 0010.
    commonjsOptions: {
      ignoreDynamicRequires: true,
    },
    lib: {
      entry: path.resolve(__dirname, './src/server/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    outDir: path.resolve(__dirname, './dist/server'),
    emptyOutDir: true,
    rollupOptions: {
      // Devvit loads a single server entry (index.cjs). Inline the dynamic
      // import('@devvit/web/server') so everything lands in one file instead of
      // emitting a separate, unshipped chunk.
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
