import { defineConfig, type Plugin } from 'vite';
import path from 'path';

// Replica los `DefinePlugin` del build oficial de Phaser: reemplaza los tokens
// `typeof FLAG` por su valor. Sin esto, `typeof WEBGL_DEBUG` queda como la cadena
// "undefined" (truthy) y el renderer intenta `require('phaser3spectorjs')` en
// runtime → el juego no arranca. Necesario SOLO al compilar Phaser desde su
// fuente (build de producción); en dev es un no-op (no se importa phaser/src).
function phaserFeatureFlags(): Plugin {
  const flags: Record<string, string> = {
    'typeof CANVAS_RENDERER': 'true',
    'typeof WEBGL_RENDERER': 'true',
    'typeof WEBGL_DEBUG': 'false',
    'typeof EXPERIMENTAL': 'false',
    'typeof FEATURE_SOUND': 'true',
    'typeof PLUGIN_CAMERA3D': 'false',
    'typeof PLUGIN_FBINSTANT': 'false',
  };
  return {
    name: 'phaser-feature-flags',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.split(path.sep).join('/').includes('/node_modules/phaser/src/')) return null;
      let out = code;
      for (const [token, value] of Object.entries(flags)) {
        out = out.split(token).join(value);
      }
      return out === code ? null : { code: out, map: null };
    },
  };
}

// Entry CJS DE FUENTE de Phaser (módulos sueltos, `module.exports`). Al compilar
// desde aquí, el plugin commonjs de Vite sigue el grafo de `require()` y Rollup ve
// cada submódulo por separado, de modo que `manualChunks` reparte el motor
// (~1.7 MB, un único módulo en el dist pre-empaquetado) en varios chunks < 500 kB.
// NO se usa `phaser-esm.js` (mezcla `export` + `require`: Rollup lo trata como ESM
// y deja los `require` internos sin resolver, tirando todo el motor).
const PHASER_SRC = path.resolve(__dirname, 'node_modules/phaser/src/phaser.js');

/** Reparte los submódulos de Phaser en buckets equilibrados (< 500 kB c/u).
 *  Tamaños (minificados) medidos: gameobjects ~360, renderer ~315, physics
 *  ~286, io ~401, core ~366 kB. */
function phaserManualChunks(id: string): string | undefined {
  const norm = id.split(path.sep).join('/');
  if (!norm.includes('/node_modules/phaser/src/')) return undefined;
  const rel = norm.split('/node_modules/phaser/src/')[1];
  if (rel.startsWith('gameobjects/')) return 'phaser-gameobjects';
  if (rel.startsWith('renderer/') || rel.startsWith('filters/') || rel.startsWith('fx/')) return 'phaser-renderer';
  if (rel.startsWith('physics/') || rel.startsWith('tilemaps/')) return 'phaser-physics';
  if (
    rel.startsWith('input/') ||
    rel.startsWith('loader/') ||
    rel.startsWith('math/') ||
    rel.startsWith('geom/') ||
    rel.startsWith('sound/') ||
    rel.startsWith('actions/') ||
    rel.startsWith('curves/')
  ) {
    return 'phaser-io';
  }
  return 'phaser-core';
}

// https://vitejs.dev/config/
// El reparto del motor Phaser se aplica SOLO en `build` (que es donde importan los
// chunks). En dev (`serve`) se usa el Phaser pre-empaquetado normal: HMR rápido,
// interop CJS/ESM del pre-bundle de Vite intacto, sin alias ni riesgos.
export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  return {
    root: path.resolve(__dirname, 'src/client'),
    plugins: [phaserFeatureFlags()], // no-op en dev (no se importa phaser/src)
    resolve: {
      alias: {
        '@shared': path.resolve(__dirname, './src/shared'),
        '@client': path.resolve(__dirname, './src/client'),
        // Solo en build: el import `phaser` apunta a la fuente CJS para poder partir
        // el motor en chunks. Los TIPOS siguen viniendo del paquete (tsc no usa este
        // alias), así que el tipado no cambia.
        ...(isBuild ? { phaser: PHASER_SRC } : {}),
      },
    },
    // El entry CJS de Phaser hace `global.Phaser = Phaser`; en el navegador `global`
    // no existe → lo mapeamos a `globalThis`. Solo hace falta en build (fuente CJS).
    ...(isBuild ? { define: { global: 'globalThis' } } : {}),
    server: {
      // Forward API calls from the Vite dev server to the local Express API (port 4000),
      // so /api/* returns JSON instead of the SPA index.html fallback.
      proxy: {
        '^/api/': 'http://localhost:4000',
        '^/internal/': 'http://localhost:4000',
      },
    },
    build: {
      outDir: path.resolve(__dirname, './dist/client'),
      emptyOutDir: true,
      // No incrustar assets como base64 en el JS: incluso los PNG pequeños (<4 kB
      // por defecto) engordan el bundle ~33% (overhead base64) y no se cachean por
      // separado. Con 0, TODOS los assets se emiten como ficheros hasheados aparte,
      // adelgazando el chunk JS. Phaser NO se toca (es JS, no un asset).
      assetsInlineLimit: 0,
      rollupOptions: {
        output: {
          // Reparte el motor Phaser (desde su fuente) en varios chunks < 500 kB y
          // deja el código de la app en su propio chunk pequeño.
          manualChunks: phaserManualChunks,
        },
        // Los submódulos de Phaser se referencian en ciclo (gameobjects↔renderer↔
        // core…), así que partirlos genera avisos "Circular chunk". Se han VERIFICADO
        // inofensivos: el build cargado (Home + combate completo) arranca sin
        // excepciones ni errores de orden de inicialización. Silenciamos SOLO ese
        // aviso; cualquier otro (incl. tamaño >500 kB) sigue mostrándose.
        onwarn(warning, defaultHandler) {
          const msg = typeof warning === 'string' ? warning : warning.message || '';
          if (msg.includes('Circular chunk')) return;
          defaultHandler(warning);
        },
      },
    },
  };
});
