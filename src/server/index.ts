import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { once } from 'node:events';
import type { Request, Response, NextFunction } from 'express';
import { localContextStorage } from './devvitProxy/index.ts';
import { Devvit, SettingScope } from '@devvit/public-api';
import { seedNPCs } from './core/npc.ts';

Devvit.addSettings([
  {
    type: 'boolean',
    name: 'enableFirstRunEvent',
    label: 'Activar evento de primera run (solo mods)',
    defaultValue: false,
    scope: SettingScope.Installation,
  },
]);

// Routers
import metaRouter from './routes/meta.ts';
import runRouter from './routes/run.ts';
import pvpRouter from './routes/pvp.ts';
import dailyRouter from './routes/daily.ts';
import recruitmentRouter from './routes/recruitment.ts';
import internalRouter from './routes/internal.ts';
import devvitInternalRouter from './routes/devvitInternal.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Body parser que preserva el AsyncLocalStorage (ALS) de Devvit.
// express.json() usa body-parser -> raw-body, que lee el stream con callbacks
// (stream events) y llama a next() desde fuera de la cadena async. Eso rompe la
// propagacion del ALS que createServer() establece por request, haciendo que
// context/reddit/redis lancen "No context found" en todos los POST routes.
// Leer el body con `await once(req, 'end')` mantiene la cadena async y el
// contexto Devvit vivo. Sigue el patron del template oficial hello-world.
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  if (!('body' in req)) (req as any).body = undefined;
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.includes('application/json')) {
    return next();
  }
  try {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    await once(req, 'end');
    const raw = Buffer.concat(chunks).toString('utf-8');
    (req as any).body = raw ? JSON.parse(raw) : {};
    next();
  } catch (err) {
    next(err);
  }
});

// Request-scoped context binding middleware (only used in local dev).
// Local standalone dev is opt-in via IS_DEV (set by scripts/dev.mjs). Under the Devvit
// runtime (playtest/upload) IS_DEV is unset — NODE_ENV is unset there too, so it must NOT
// be part of this check — and we run the real server via createServer/getServerPort.
const isDev = process.env.IS_DEV === 'true';

if (isDev) {
  app.use((req, res, next) => {
    // Extract user ID from header or default to t2_devuser
    const userId = (req.headers['x-user-id'] as string) || 't2_devuser';
    localContextStorage.run({ userId }, next);
  });
}

// API Routes
app.use('/api', metaRouter);
app.use('/api/run', runRouter);
app.use('/api/pvp', pvpRouter);
app.use('/api/daily', dailyRouter);
app.use('/api/recruitment', recruitmentRouter);
app.use('/api/internal', internalRouter);
// Endpoints invocados por Devvit (menú / triggers) — deben colgar de /internal/*
app.use('/internal', devvitInternalRouter);

import fs from 'fs';

// Serve static assets from Vite build in client directory
const clientBuildPath = fs.existsSync(path.join(process.cwd(), 'dist/client'))
  ? path.join(process.cwd(), 'dist/client')
  : path.join(__dirname, '../client');

app.use(express.static(clientBuildPath));

// SPA Client-side routing fallback
app.get('/*splat', (req, res, next) => {
  // If it looks like an API call or file resource, skip fallback
  if (req.url.startsWith('/api') || req.url.includes('.')) {
    return next();
  }
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Startup Seeding & Server Listening Configuration
async function startServer() {
  if (isDev) {
    const port = process.env.PORT || 4000;
    app.listen(port, async () => {
      console.log(`\n======================================================`);
      console.log(`🚀 Tiny Tacticians Local Dev Server listening at:`);
      console.log(`   http://localhost:${port}`);
      console.log(`======================================================\n`);

      // Auto-seed NPCs on local startup to ensure opponents are ready
      try {
        await seedNPCs();
      } catch (err) {
        console.error('Failed to seed NPCs on startup:', err);
      }
    });
  } else {
    // Dynamic import inside async function is CJS compatible
    const { createServer, getServerPort } = await import('@devvit/web/server');
    const server = createServer(app);
    const port = getServerPort();
    console.log(`[Devvit Web Server] Listening on port: ${port}`);
    server.listen(port);
  }
}

startServer().catch(err => {
  console.error('Fatal error starting Tiny Tacticians server:', err);
});
