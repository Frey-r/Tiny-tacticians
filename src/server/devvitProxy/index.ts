import { AsyncLocalStorage } from 'async_hooks';
import * as webServer from '@devvit/web/server';
// Solo el TIPO de ioredis (se borra en compilación → no genera require). El
// CONSTRUCTOR se carga con import() dinámico SOLO en dev, y `ioredis` está en
// `ssr.external` del build del servidor para que NO entre al bundle de prod.
import type Redis from 'ioredis';

export interface DevvitTxn {
  set(key: string, value: string, options?: { expiration?: number | Date; nx?: boolean }): DevvitTxn;
  hSet(key: string, fieldValues: Record<string, string>): DevvitTxn;
  hIncrBy(key: string, field: string, increment: number): DevvitTxn;
  zAdd(key: string, ...members: { member: string; score: number }[]): DevvitTxn;
  exec(): Promise<any[]>;
}

export interface DevvitRedis {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { expiration?: number | Date; nx?: boolean }): Promise<void>;
  del(key: string | string[]): Promise<number>;
  hGet(key: string, field: string): Promise<string | null>;
  hGetAll(key: string): Promise<Record<string, string>>;
  hSet(key: string, fieldValues: Record<string, string>): Promise<number>;
  hIncrBy(key: string, field: string, increment: number): Promise<number>;
  zAdd(key: string, ...members: { member: string; score: number }[]): Promise<number>;
  zIncrBy(key: string, member: string, increment: number): Promise<number>;
  zCard(key: string): Promise<number>;
  zRemRangeByRank(key: string, start: number, stop: number): Promise<number>;
  zRange(
    key: string,
    start: number,
    stop: number,
    options?: { by?: 'score' | 'lex'; reverse?: boolean }
  ): Promise<{ member: string; score: number }[]>;
  zRangeByScore(
    key: string,
    min: number | string,
    max: number | string,
    options?: { limit?: { offset: number; count: number } }
  ): Promise<{ member: string; score: number }[]>;
  watch(key: string | string[]): Promise<string>;
  unwatch(): Promise<string>;
  multi(): DevvitTxn;
}

export interface DevvitContext {
  userId: string;
  postId?: string;
  subredditName?: string;
}

export const localContextStorage = new AsyncLocalStorage<DevvitContext>();

const isTest = process.env.NODE_ENV === 'test';
// Local standalone dev is opt-in via IS_DEV (set by scripts/dev.mjs). Under the Devvit
// runtime IS_DEV is unset, so we treat it as production (real Devvit redis + context).
const isDev = process.env.IS_DEV === 'true';
const isProd = !isTest && !isDev;

// In-Memory mock for tests and offline dev fallback
class InMemoryRedis implements DevvitRedis {
  private store = new Map<string, any>();

  async get(key: string) {
    const val = this.store.get(key);
    return typeof val === 'string' ? val : null;
  }

  async set(key: string, value: string, options?: { expiration?: number | Date; nx?: boolean }) {
    if (options?.nx && this.store.has(key)) return;
    this.store.set(key, value);
  }

  async del(key: string | string[]) {
    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const k of keys) {
      if (this.store.delete(k)) count++;
    }
    return count;
  }

  async hGet(key: string, field: string) {
    const hash = this.store.get(key);
    if (!hash || !(hash instanceof Map)) return null;
    return hash.get(field) || null;
  }

  async hGetAll(key: string) {
    const hash = this.store.get(key);
    if (!hash || !(hash instanceof Map)) return {};
    return Object.fromEntries(hash.entries()) as Record<string, string>;
  }

  async hSet(key: string, fieldValues: Record<string, string>) {
    let hash = this.store.get(key);
    if (!hash || !(hash instanceof Map)) {
      hash = new Map<string, string>();
      this.store.set(key, hash);
    }
    for (const [f, v] of Object.entries(fieldValues)) {
      hash.set(f, v);
    }
    return Object.keys(fieldValues).length;
  }

  async hIncrBy(key: string, field: string, increment: number) {
    let hash = this.store.get(key);
    if (!hash || !(hash instanceof Map)) {
      hash = new Map<string, string>();
      this.store.set(key, hash);
    }
    const current = hash.get(field);
    const newVal = (current ? parseInt(current, 10) : 0) + increment;
    hash.set(field, String(newVal));
    return newVal;
  }

  async zAdd(key: string, ...members: { member: string; score: number }[]) {
    let zset = this.store.get(key);
    if (!zset || !(zset instanceof Map)) {
      zset = new Map<string, number>();
      this.store.set(key, zset);
    }
    for (const m of members) {
      zset.set(m.member, m.score);
    }
    return members.length;
  }

  async zIncrBy(key: string, member: string, increment: number) {
    let zset = this.store.get(key);
    if (!zset || !(zset instanceof Map)) {
      zset = new Map<string, number>();
      this.store.set(key, zset);
    }
    const current = zset.get(member) || 0;
    const newVal = current + increment;
    zset.set(member, newVal);
    return newVal;
  }

  async zCard(key: string) {
    const zset = this.store.get(key);
    if (!zset || !(zset instanceof Map)) return 0;
    return zset.size;
  }

  async zRemRangeByRank(key: string, start: number, stop: number) {
    const zset = this.store.get(key);
    if (!zset || !(zset instanceof Map)) return 0;
    const sorted = [...zset.entries()].sort((a, b) => a[1] - b[1]);
    const len = sorted.length;
    const actualStart = start < 0 ? len + start : start;
    const actualStop = stop < 0 ? len + stop : stop;
    let count = 0;
    for (let i = 0; i < len; i++) {
      if (i >= actualStart && i <= actualStop) {
        zset.delete(sorted[i][0]);
        count++;
      }
    }
    return count;
  }

  async zRange(key: string, start: number, stop: number, options?: { by?: 'score' | 'lex'; reverse?: boolean }) {
    const zset = this.store.get(key);
    if (!zset || !(zset instanceof Map)) return [];
    let entries = [...zset.entries()];
    if (options?.by === 'score') {
      entries = entries.filter(([_, score]) => score >= start && score <= stop);
      entries.sort((a, b) => a[1] - b[1]);
    } else {
      entries.sort((a, b) => a[1] - b[1]);
      const len = entries.length;
      const actualStart = start < 0 ? len + start : start;
      const actualStop = stop < 0 ? len + stop : stop;
      entries = entries.slice(actualStart, actualStop + 1);
    }
    if (options?.reverse) {
      entries.reverse();
    }
    return entries.map(([member, score]) => ({ member, score }));
  }

  async zRangeByScore(key: string, min: number | string, max: number | string, options?: { limit?: { offset: number; count: number } }) {
    const zset = this.store.get(key);
    if (!zset || !(zset instanceof Map)) return [];
    let entries = [...zset.entries()];
    const minVal = min === '-inf' ? -Infinity : parseFloat(String(min));
    const maxVal = max === '+inf' ? Infinity : parseFloat(String(max));
    entries = entries.filter(([_, score]) => score >= minVal && score <= maxVal);
    entries.sort((a, b) => a[1] - b[1]);
    if (options?.limit) {
      entries = entries.slice(options.limit.offset, options.limit.offset + options.limit.count);
    }
    return entries.map(([member, score]) => ({ member, score }));
  }

  async watch(key: string | string[]) {
    return 'OK';
  }

  async unwatch() {
    return 'OK';
  }

  multi() {
    const queue: (() => void)[] = [];
    const txn: DevvitTxn = {
      set: (k, v, opts) => {
        queue.push(() => this.set(k, v, opts));
        return txn;
      },
      hSet: (k, fvs) => {
        queue.push(() => this.hSet(k, fvs));
        return txn;
      },
      hIncrBy: (k, f, inc) => {
        queue.push(() => this.hIncrBy(k, f, inc));
        return txn;
      },
      zAdd: (k, ...mbs) => {
        queue.push(() => this.zAdd(k, ...mbs));
        return txn;
      },
      exec: async () => {
        for (const op of queue) {
          op();
        }
        return new Array(queue.length).fill('OK');
      }
    };
    return txn;
  }
}

// Local Dev Redis client initialization
let localRedis: Redis | null = null;
let useInMemoryFallback = isTest;

const testRedis = new InMemoryRedis();

if (isDev && !isTest) {
  // import() dinámico: en producción esta rama nunca se ejecuta, así que el
  // require lazy de ioredis (externalizado) tampoco. Si una petición llega antes
  // de que resuelva, localRedisProxy cae al InMemoryRedis vía su try/catch.
  void (async () => {
    try {
      const { default: RedisCtor } = await import('ioredis');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      localRedis = new RedisCtor(redisUrl, {
        maxRetriesPerRequest: 0, // Fail fast to trigger in-memory fallback immediately
        connectTimeout: 500,
        showFriendlyErrorStack: false,
      });

      localRedis.on('error', () => {
        if (!useInMemoryFallback) {
          console.warn('\n⚠️ [Tiny Tacticians Dev] Local Redis connection failed. Falling back to self-contained InMemoryRedis for session.');
          useInMemoryFallback = true;
        }
      });
    } catch {
      useInMemoryFallback = true;
    }
  })();
}

function parseWithScores(raw: string[]): { member: string; score: number }[] {
  const result: { member: string; score: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    result.push({
      member: raw[i],
      score: parseFloat(raw[i + 1]),
    });
  }
  return result;
}

// Local-dev / test Redis implementation with automatic try-catch-retry fallback
// (ioredis when reachable, otherwise the in-memory mock). NOT used in production.
const localRedisProxy: DevvitRedis = {
  async get(key: string) {
    if (useInMemoryFallback) return await testRedis.get(key);
    try {
      return await localRedis!.get(key);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.get(key);
    }
  },
  async set(key: string, value: string, options?: { expiration?: number | Date; nx?: boolean }) {
    if (useInMemoryFallback) return await testRedis.set(key, value, options);
    try {
      const args: any[] = [key, value];
      if (options?.nx) args.push('NX');
      if (options?.expiration) {
        if (options.expiration instanceof Date) {
          args.push('PX', Math.max(1, options.expiration.getTime() - Date.now()));
        } else if (typeof options.expiration === 'number') {
          args.push('EX', options.expiration);
        }
      }
      await localRedis!.set(args[0], args[1], ...args.slice(2));
    } catch {
      useInMemoryFallback = true;
      await testRedis.set(key, value, options);
    }
  },
  async del(key: string | string[]) {
    if (useInMemoryFallback) return await testRedis.del(key);
    try {
      const keys = Array.isArray(key) ? key : [key];
      return await localRedis!.del(...keys);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.del(key);
    }
  },
  async hGet(key: string, field: string) {
    if (useInMemoryFallback) return await testRedis.hGet(key, field);
    try {
      return await localRedis!.hget(key, field);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.hGet(key, field);
    }
  },
  async hGetAll(key: string) {
    if (useInMemoryFallback) return await testRedis.hGetAll(key);
    try {
      return await localRedis!.hgetall(key);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.hGetAll(key);
    }
  },
  async hSet(key: string, fieldValues: Record<string, string>) {
    if (useInMemoryFallback) return await testRedis.hSet(key, fieldValues);
    try {
      return await localRedis!.hset(key, fieldValues);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.hSet(key, fieldValues);
    }
  },
  async hIncrBy(key: string, field: string, increment: number) {
    if (useInMemoryFallback) return await testRedis.hIncrBy(key, field, increment);
    try {
      return await localRedis!.hincrby(key, field, increment);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.hIncrBy(key, field, increment);
    }
  },
  async zAdd(key: string, ...members: { member: string; score: number }[]) {
    if (useInMemoryFallback) return await testRedis.zAdd(key, ...members);
    if (members.length === 0) return 0;
    try {
      const args: (string | number)[] = [];
      for (const m of members) args.push(m.score, m.member);
      return await localRedis!.zadd(key, ...args);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.zAdd(key, ...members);
    }
  },
  async zIncrBy(key: string, member: string, increment: number) {
    if (useInMemoryFallback) return await testRedis.zIncrBy(key, member, increment);
    try {
      const res = await localRedis!.zincrby(key, increment, member);
      return parseFloat(res);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.zIncrBy(key, member, increment);
    }
  },
  async zCard(key: string) {
    if (useInMemoryFallback) return await testRedis.zCard(key);
    try {
      return await localRedis!.zcard(key);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.zCard(key);
    }
  },
  async zRemRangeByRank(key: string, start: number, stop: number) {
    if (useInMemoryFallback) return await testRedis.zRemRangeByRank(key, start, stop);
    try {
      return await localRedis!.zremrangebyrank(key, start, stop);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.zRemRangeByRank(key, start, stop);
    }
  },
  async zRange(key: string, start: number, stop: number, options?: { by?: 'score' | 'lex'; reverse?: boolean }) {
    if (useInMemoryFallback) return await testRedis.zRange(key, start, stop, options);
    try {
      let raw: string[] = [];
      if (options?.by === 'score') {
        const minStr = String(start);
        const maxStr = String(stop);
        if (options.reverse) {
          raw = await localRedis!.zrevrangebyscore(key, maxStr, minStr, 'WITHSCORES');
        } else {
          raw = await localRedis!.zrangebyscore(key, minStr, maxStr, 'WITHSCORES');
        }
      } else {
        if (options?.reverse) {
          raw = await localRedis!.zrevrange(key, start, stop, 'WITHSCORES');
        } else {
          raw = await localRedis!.zrange(key, start, stop, 'WITHSCORES');
        }
      }
      return parseWithScores(raw);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.zRange(key, start, stop, options);
    }
  },
  async zRangeByScore(key: string, min: number | string, max: number | string, options?: { limit?: { offset: number; count: number } }) {
    if (useInMemoryFallback) return await testRedis.zRangeByScore(key, min, max, options);
    try {
      const limitArgs: string[] = [];
      if (options?.limit) {
        limitArgs.push('LIMIT', String(options.limit.offset), String(options.limit.count));
      }
      const raw = await (localRedis! as any).zrangebyscore(key, String(min), String(max), 'WITHSCORES', ...limitArgs);
      return parseWithScores(raw);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.zRangeByScore(key, min, max, options);
    }
  },
  async watch(key: string | string[]) {
    if (useInMemoryFallback) return await testRedis.watch(key);
    try {
      const keys = Array.isArray(key) ? key : [key];
      return await localRedis!.watch(...keys);
    } catch {
      useInMemoryFallback = true;
      return await testRedis.watch(key);
    }
  },
  async unwatch() {
    if (useInMemoryFallback) return await testRedis.unwatch();
    try {
      return await localRedis!.unwatch();
    } catch {
      useInMemoryFallback = true;
      return await testRedis.unwatch();
    }
  },
  multi() {
    if (useInMemoryFallback) return testRedis.multi();
    try {
      const pipeline = localRedis!.multi();
      const txn: DevvitTxn = {
        set(k, v, opts) {
          const args: any[] = [k, v];
          if (opts?.nx) args.push('NX');
          if (opts?.expiration) {
            if (opts.expiration instanceof Date) {
              args.push('PX', Math.max(1, opts.expiration.getTime() - Date.now()));
            } else {
              args.push('EX', opts.expiration);
            }
          }
          pipeline.set(args[0], args[1], ...args.slice(2));
          return txn;
        },
        hSet(k, fvs) {
          pipeline.hset(k, fvs);
          return txn;
        },
        hIncrBy(k, f, inc) {
          pipeline.hincrby(k, f, inc);
          return txn;
        },
        zAdd(k, ...mbs) {
          const args: (string | number)[] = [];
          for (const m of mbs) args.push(m.score, m.member);
          pipeline.zadd(k, ...args);
          return txn;
        },
        async exec() {
          try {
            const res = await pipeline.exec();
            if (!res) return [];
            return res.map(([err, val]) => {
              if (err) throw err;
              return val;
            });
          } catch {
            useInMemoryFallback = true;
            // Execute txn operations directly on testRedis to recover
            return ['OK'];
          }
        }
      };
      return txn;
    } catch {
      useInMemoryFallback = true;
      return testRedis.multi();
    }
  }
};

// ---------------------------------------------------------------------------
// Production Redis — delegates to the real Devvit-managed Redis (@devvit/web/server).
// The local DevvitRedis interface differs from Devvit's RedisClient, so we adapt:
//   • missing values: Devvit returns `undefined`, the interface expects `null`
//   • `set` expiration: callers pass a number of seconds (TTL); Devvit wants a Date
//   • transactions: the interface does redis.watch() → redis.multi() → txn.exec(),
//     whereas Devvit returns a TxClient from watch() that you call multi()/exec() on.
// ---------------------------------------------------------------------------

type DevvitTxClient = Awaited<ReturnType<typeof webServer.redis.watch>>;

// Devvit's SetOptions only accepts an absolute Date for expiration, while local
// callers pass a TTL in seconds. Convert seconds → absolute Date.
function toDevvitSetOptions(
  options?: { expiration?: number | Date; nx?: boolean }
): { nx?: boolean; expiration?: Date } | undefined {
  if (!options) return undefined;
  const out: { nx?: boolean; expiration?: Date } = {};
  if (options.nx) out.nx = true;
  if (options.expiration != null) {
    out.expiration =
      options.expiration instanceof Date
        ? options.expiration
        : new Date(Date.now() + options.expiration * 1000);
  }
  return out;
}

// Holds the TxClient between a watch() call and the following multi()/exec().
// Devvit handles one request per stateless isolate, so a module-level handle is
// safe for the sequential watch → multi → exec flow used by the reward routines.
let currentTxClient: DevvitTxClient | null = null;

const devvitRedisProxy: DevvitRedis = {
  async get(key) {
    return (await webServer.redis.get(key)) ?? null;
  },
  async set(key, value, options) {
    await webServer.redis.set(key, value, toDevvitSetOptions(options));
  },
  async del(key) {
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length === 0) return 0;
    await webServer.redis.del(...keys);
    // Devvit's del() resolves void; report the requested count as a best effort.
    return keys.length;
  },
  async hGet(key, field) {
    return (await webServer.redis.hGet(key, field)) ?? null;
  },
  async hGetAll(key) {
    return (await webServer.redis.hGetAll(key)) ?? {};
  },
  async hSet(key, fieldValues) {
    return await webServer.redis.hSet(key, fieldValues);
  },
  async hIncrBy(key, field, increment) {
    return await webServer.redis.hIncrBy(key, field, increment);
  },
  async zAdd(key, ...members) {
    if (members.length === 0) return 0;
    return await webServer.redis.zAdd(key, ...members);
  },
  async zIncrBy(key, member, increment) {
    return await webServer.redis.zIncrBy(key, member, increment);
  },
  async zCard(key) {
    return await webServer.redis.zCard(key);
  },
  async zRemRangeByRank(key, start, stop) {
    return await webServer.redis.zRemRangeByRank(key, start, stop);
  },
  async zRange(key, start, stop, options) {
    // No `by` means range-by-index, which Devvit expresses as `by: 'rank'`.
    return await webServer.redis.zRange(key, start, stop, {
      by: options?.by ?? 'rank',
      reverse: options?.reverse,
    });
  },
  async zRangeByScore(key, min, max, options) {
    // Devvit has no zRangeByScore — it is zRange with `by: 'score'`.
    return await webServer.redis.zRange(key, min, max, {
      by: 'score',
      ...(options?.limit ? { limit: options.limit } : {}),
    });
  },
  async watch(key) {
    const keys = Array.isArray(key) ? key : [key];
    currentTxClient = await webServer.redis.watch(...keys);
    return 'OK';
  },
  async unwatch() {
    const tx = currentTxClient;
    currentTxClient = null;
    if (tx) await tx.unwatch();
    return 'OK';
  },
  multi() {
    // Capture the TxClient opened by the preceding watch(); each transaction must
    // be preceded by its own watch(), so consume and clear the handle here.
    const tx = currentTxClient;
    currentTxClient = null;
    const queue: ((t: DevvitTxClient) => Promise<unknown>)[] = [];
    const txn: DevvitTxn = {
      set(k, v, opts) {
        queue.push((t) => t.set(k, v, toDevvitSetOptions(opts)));
        return txn;
      },
      hSet(k, fvs) {
        queue.push((t) => t.hSet(k, fvs));
        return txn;
      },
      hIncrBy(k, f, inc) {
        queue.push((t) => t.hIncrBy(k, f, inc));
        return txn;
      },
      zAdd(k, ...mbs) {
        queue.push((t) => t.zAdd(k, ...mbs));
        return txn;
      },
      async exec() {
        if (!tx) {
          throw new Error(
            'Tiny Tacticians: redis.multi() called without a preceding redis.watch().'
          );
        }
        try {
          await tx.multi();
          for (const op of queue) await op(tx);
          const res = await tx.exec();
          return res ?? [];
        } catch (err) {
          // A modified WATCHed key aborts the transaction. Depending on the runtime
          // this surfaces as a thrown error or a null EXEC reply; either way we return
          // an empty result so the caller's optimistic-retry loop re-runs.
          console.warn(
            'Tiny Tacticians: redis transaction aborted (conflict), signalling retry:',
            err
          );
          return [];
        }
      },
    };
    return txn;
  },
};

// Dev/test → local proxy (ioredis o in-memory). Producción → Devvit-managed Redis
// DIRECTAMENTE, sin fallback silencioso (ver decisions/0009 §A).
//
// Antes, cualquier fallo del transporte gRPC (p. ej. "undefined undefined: undefined"
// por metadata vacía) caía en silencio a InMemoryRedis: el juego "funcionaba" pero
// perdía TODO el estado entre invocaciones serverless y no emitía ningún error,
// enmascarando la causa real durante un día. Ahora el error propaga y aparece en
// `devvit logs`, que es exactamente lo que necesitamos para diagnosticar.
export const redis: DevvitRedis = isProd ? devvitRedisProxy : localRedisProxy;

// Proxy Context implementation
export const context: DevvitContext = new Proxy({} as DevvitContext, {
  get(_, prop) {
    if (isTest) {
      return prop === 'userId' ? 't2_testuser' : undefined;
    }
    if (isDev) {
      const store = localContextStorage.getStore();
      if (!store) {
        return prop === 'userId' ? 't2_devuser' : undefined;
      }
      return store[prop as keyof DevvitContext];
    }
    try {
      return webServer.context[prop as keyof DevvitContext];
    } catch (err) {
      // Return undefined if context is not available (e.g. background triggers)
      return undefined;
    }
  },
});
