# CODEMAP — Tiny Tacticians

Mapa de referencia del código. Objetivo: ubicar rápido "dónde está X" sin releer todo el repo.
Formato: `archivo:línea — descripción`. Generado 2026-07-14, revisar si el diff es grande.

Convenciones de nombres del repo: consejero = advisor, general = personaje entrenado, run = campaña
de entrenamiento de 16 turnos, battle = combate 1v1 resuelto por turnos, PvpCombatScene = animación 6v6
de un BattleResult ya decidido (no es lógica de juego, es "teatro").

---

## 0. Config y entry points de proyecto

| Archivo | Qué es |
|---|---|
| `devvit.json` | Manifest Devvit: post entry `dist/client`, server `dist/server/index.cjs`, permisos (`reddit.asUser:SUBMIT_POST`, `redis`), menú moderador, triggers `onAppInstall/Upgrade`→`/internal/on-install`, cron diario→`/internal/cron/daily-rollover`. |
| `package.json` scripts | `dev` (bun scripts/dev.mjs), `dev:client` (vite), `dev:server` (bun --hot), `build` (2 builds vite: client + server), `test` (vitest run), `devvit`/`login`/`upload`/`playtest` (CLI vía `node node_modules/devvit/bin/devvit.js`, ver memoria `devvit-cli-windows`). |
| `vite.config.ts` / `vite.config.server.ts` | Build client (Phaser SPA) y server (bundle self-contained, `noExternal:true`, ver memoria `devvit-server-bundle-self-contained`). |
| `decisions/0001-0012` | ADRs: motor determinista, conexión, concurrencia, Redis, idempotencia, scheduling, cold-start, Redis gestionado Devvit, diagnóstico fallo post, fix bundling gRPC, resolución por dados, activación aleatoria consejeros. |
| `specs/*.spec.md` | Specs funcionales: combat-pvp, daily-events, dice-resolution, meta-progression, run-training, security, simulation-engine. |
| `tests/*.test.ts` | 15 archivos vitest, cubren balance/daily/dice/encounters/mood/prng/rateLimit/recruitment/rewards/runDice/runs/simulateBattle/simulateRun/stepRun/validate. |
| `mockups/*.md` | Mockups de UI por pantalla (coleccion/eventos/home/pvp/run-setup/run) + `ui-elements.md`. |

---

## 1. Cliente (`src/client/`) — Phaser 4

### 1.1 Bootstrap

- **`main.ts`** — entry point. `config`:18 (Phaser game config), `start()`:49 (async init). Registro de escenas L36-46: `[BootScene, HomeScene, CollectionScene, RunSetupScene, RunPlayScene, ReclutamientoScene, PvpScene, PvpCombatScene, EventosScene]`. Listeners resize/orientationchange L64-73.
- **`scenes/BootScene.ts`** (key `'Boot'`) — precarga TODOS los assets estáticos (no combate). `preload()`:44, `create()`:90 → `bakeUiTextures()` (ui/bake.ts) → `scene.start('Home')`:123. Barra de carga: `drawLoadingBar()`:126, progreso L153.
- **`assets.ts`** (532 líneas) — registro central de assets vía `import.meta.glob`. Ver §4.

### 1.2 State y red

- **`state.ts`** — caché cliente no autoritativa. `Store` interface:9, `store` singleton:16, `loadUserData()`:24 (llama `/api/profile`, `/api/consejeros`, `/api/run/generals`). Usado por casi todas las escenas.
- **`api.ts`** — fetch wrapper. `getDevUserId()`/`setDevUserId()`:4-8 (header `x-user-id`), `api.get<T>()`:24, `api.post<T>()`:38 (auto-agrega `idempToken`, `generateIdempToken()`:19).
- **`util.ts`** — `tierLetter()`:2, `randomGeneralName()`:12.

### 1.3 Escenas (pantallas del juego)

| Escena (key) | Archivo | Propósito | Navega a |
|---|---|---|---|
| `Boot` | scenes/BootScene.ts | precarga + bake UI | `Home` |
| `Home` | scenes/HomeScene.ts | campo idle, nav principal. `create()`:21, `buildNav()`:179, nubes a la deriva `driftCloud()`:166 (tween loop infinito) | `RunSetup`, `Pvp`, `Collection`, `Eventos` |
| `RunSetup` | scenes/RunSetupScene.ts | elegir 3 consejeros + nombre. `startRun()`:124 → `POST /api/run/start` | `RunPlay` |
| `RunPlay` | scenes/RunPlayScene.ts (651L) | **campaña de 16 turnos**, delega toda la sim a `shared/sim/stepRun`. Ver §1.4 (loop principal del juego) | overlay `PvpCombat` (encuentros), `Home` |
| `Eventos` | scenes/EventosScene.ts | reto diario + accesos especiales. `playDaily()`:137→`POST /api/daily/battle`, `claimDaily()`:164→`POST /api/daily/claim` | `PvpCombat`, `RunSetup`, `Pvp`, `Home` |
| `Collection` | scenes/CollectionScene.ts | tabs Consejeros/Generales, subir nivel, enviar a combate. `levelUp()`:190, `battle()`:206 | `Reclutamiento`, `Pvp`, `PvpCombat`, `Home` |
| `Reclutamiento` | scenes/ReclutamientoScene.ts (336L) | catálogo scrollable 37 consejeros, préstamo/desbloqueo. Scroll manual drag+wheel L190-221 | `Collection` |
| `Pvp` | scenes/PvpScene.ts | lobby arena: elegir general, buscar rival, leaderboard. `startBattle()`:206→`POST /api/pvp/battle` | `RunSetup`, `PvpCombat`, `Home` |
| `PvpCombat` | scenes/PvpCombatScene.ts (585L) | **animador de batalla 6v6** de un `BattleResult` ya resuelto. Ver §1.4 | `returnScene` recibido en `init()`, o `onDone()` si es overlay |

### 1.4 Loops de juego relevantes

- **Turn loop de la run** — `RunPlayScene`: cada acción del jugador (`train()`:475, `rest()`:484, `chooseEvent()`:494) incrementa `this.turn` y llama `recompute()`:464, que re-simula TODO el actionLog acumulado con `stepRun` (paridad cliente/servidor). Feedback visual: `playDiceThenFeedback()`:530 (usa `DiceRoller`). Encuentros: `maybeShowEncounter()`:596 → `launchEncounterCombat()`:608 → `scene.launch('PvpCombat', {...})` + `scene.pause()` (overlay, no navegación).
- **Round loop de combate visual** — `PvpCombatScene.playRound(i)`:334 se autoencola con `this.time.delayedCall(...)` llamando `playRound(i+1)` hasta agotar `battle.rounds`; entonces `resolve()`:509. Se puede saltar con `skip()`:502 (`buildSkipControl()`:487). Clase interna `BattleUnit`:46 (`meleeAttack()`:83, `shoot()`:108, `flinch()`:118, `die()`:128).

### 1.5 UI (`src/client/ui/`)

- **`theme.ts`** — única fuente de verdad de paleta/fuentes/layout. `COLORS`:8 (bg/maroon/lime/card/grass/afinidades OFE-rojo/DEF-azul/MAN-morado con Top/Edge para bisel), `FONT`:58, `GAME_W=960/GAME_H=1280`:68-69, `PAD=44`:72, `TOUCH_H=72`:76, `fontPx()`:104 (único punto de escalado, `FONT_SCALE=1.35` en desktop).
- **`widgets.ts`** (452L) — librería base: `portrait()`:20, `hpBar()`:38, `loadingOverlay()`:67, `toast()`:80, `floatingGain()`:101, `outcomeBanner()`:121, `countUp()`:146, `titleText()`/`bodyText()`:159/185, `retroButton()`:231 (patrón hit-area: `setInteractive(new Rectangle(0,0,w,h),...)` — rect TOP-LEFT no centrado, ver memoria `phaser-container-hitarea-origin`), `retroPanel()`:342, `screenTopbar()`:362 (incluye toggle de música con `localStorage['game_muted']`), `resourcePill()`:412, `headerBar()`:435.
- **`scrollPanel.ts`** — modal con lista scrolleable (usado para logs de batalla). `openScrollPanel()`:24. Patrón "curtain" real: `createGeometryMask()`:66-67 sobre graphics de máscara (destroy manual en `close()`); scroll drag+wheel en listeners globales `scene.input`, no en el content (ver memoria `phaser-scroll-curtains`).
- **`terrain.ts`** — campo de césped decorado determinista. `grassField()`:48, PRNG mulberry32 interno `rng()`:33 (reproducible por seed), orden por profundidad Y L131.
- **`diceRoller.ts`** — animación de tirada de dados (resultado ya decidido por sim). `class DiceRoller`:40, `.roll(res)`:73, bandas `FALLO/NORMAL/CRITICO`:28-38.
- **`consejeroDetail.ts`** — modal de detalle compartido Colección/Reclutamiento. `openConsejeroModal()`:98 (modal "templado por config", mismo componente con `action` distinto).
- **`abilityCast.ts`** — feedback visual de habilidad en combate. `ABILITY_META`:60, `iconDie()`:69 (mini-dado decorativo), `class CommanderPanel`:153 (`.cast()`:213).
- **`bake.ts`** — preproceso de texturas nine-slice (una vez, en `BootScene.create()`). `bakeUiTextures()`:13, `applyFilters()`:43 (desaturar/aclarar por píxel).

### 1.6 Combate visual (`src/client/combat/`)

- **`army.ts`** — deriva composición 6v6 desde stats del General (afinidad→tipo de unidad), soporta enemigos sintéticos PvE. `deriveArmy()`:67 (reparto "largest remainder" L77-89), `animKey()`:45 (patrón `cu_<tipo><Facción>_<acción>`), `factionForEnemy()`:58, `isSyntheticEnemy()`:51.
- **`combatAssets.ts`** — lazy-load de sprites de combate/FX solo al entrar a `PvpCombat` (ahorra ~300KB en arranque). `queueBattleAssets()`:22, `ensureBattleAnims()`:46.

### 1.7 Assets (`assets.ts`, 532 líneas)

Registro central por `import.meta.glob`. Claves principales: `ICON`:21, `AVATARS`:41 + `avatarKeyFor()`:61, `PANEL`:73, `UI_BAKES`:121, `BTN_SKIN`:147, `BAR_SKIN`:161, `MUSIC`:173, `DICE`:182, `SPRITE`:232, `UNIT_SHEETS`:314 (patrón `cu_<warrior|archer|lancer><Blue|Red>_<idle|run|attack1|attack2|guard|shoot>`), `FX_SHEETS`:334, `ARROW`:341, `TERRAIN`:353/`TERRAIN_SHEETS`:366, `ENEMY_UNIT_SHEETS`:511 (patrón `cu_<tipo><goblin|beast|undead|warlord>_<acción>`).

---

## 2. Simulación compartida (`src/shared/sim/`) — el "modelo" del juego

Motor determinista puro (sin I/O), usado tanto por cliente (preview) como servidor (autoritativo).
Cadena de dependencias: `prng`→`dice`→`balance`(+`consejeroCatalog`)→`simulateBattle`→`stepRun`→`simulateRun`→`validate`. Todo re-exportado por `index.ts`.

- **`prng.ts`** — `class PRNG`:1 (seed string|number, FNV-1a hash), `nextFloat()`:19, `nextInt()`:29, `nextHex()`:36.
- **`dice.ts`** — motor de dados determinista. `rollDice(prng, roll)`:144 **consume el PRNG** (única función que lo hace); `rollOdds()`:164 (odds analíticas sin consumir, para previews); `makeDie/lockFace/restrictRange/addDice/shiftThresholds/baseRoll`:57-135 (composición de `DiceRoll`); `MAX_DICE=4`:53.
- **`balance.ts`** (639L, **el archivo de constantes más importante**):
  - Stats base L16-21 (`BASE_STAT=10, MAX_STAT=100, RUN_TURNS=16, LOADOUT_SIZE=3`)
  - Energía L24-26 (`ENERGY_MAX=100, TRAIN_COST=12, REST_GAIN=45`)
  - Mood/ánimo L39-66 (`MOOD_START=1.0`, rango 0.5-1.5, `MOOD_DELTA` tabla:58) + `nextMood()`:69, `moodDiceShift()`:78
  - Activación de consejeros L106-129 (`activationRamp()`:110, `activationChance()`:117, `activeAdvisorsForTurn()`:122 — subset activo determinista por turno)
  - `calculatePower()`:133 (`ofe+def+man*1.2`), `calculateTier()`:137
  - Arquetipos de entrenamiento L189-249 (`consejeroTrainMod()`:210, switch maestro/alquimista/intendente)
  - `planTrainTurn()`:266 — combina mods arquetipo+efectos de run+mood→`DiceRoll` final
  - `BRANCHING_EVENTS` L389-531 — 5 eventos ramificados (storm/merchant/duel/supplies/veteran), cada uno 2 branches
  - Encuentros L569-632 (`ENCOUNTER_COUNT=4, BOSS_POWER=120, ENCOUNTER_POWERS=[50,80,100,120]`, `makeEnemyGeneral()`:615, `applyEncounterBonus()`:632)
- **`consejeroCatalog.ts`** — fuente única de 40 consejeros. `COMBAT_ABILITIES`:39 (9 skills compartidas), `ROWS`/`CONSEJERO_CATALOG` L117-163 (tabla completa), `consejeroDef(id)`:185, `RUN_EFFECTS`:90.
- **`consejeroAbilities.ts`** — puente de re-export (sin lógica propia).
- **`validate.ts`** — `validateActionLog(seed, deckSnapshot, actionLog, opts)`:9, valida estructura/longitud/coherencia turnos evento vs train/rest.
- **`stepRun.ts`** (299L) — **CORE GAME LOOP de la run**: `stepRun(seed, deck, actionLog)`:113, loop `for t in actionLog` L129-242 — por turno: si es turno de evento resuelve rama+dado; si `rest` suma energía; si `train` calcula participantes activos→`planTrainTurn`→tira dado→aplica ganancia a stat; tras cada turno chequea `encounterAfterTurn()` y si hay boss llama `simulateBattle` con seed derivado (no toca el PRNG principal). También `previewTurn()`:276 (preview sin consumir PRNG, usado por UI antes de confirmar).
- **`simulateBattle.ts`** (242L) — **CORE COMBAT LOOP 1v1**: `simulateBattle(seed, generalA, generalB)`:34. HP inicial L39-40, iniciativa por `man` L53-68, `while (hpA>0 && hpB>0 && round<=30)` L93-207 (daño base = ofe+rand(5,15) - mitigación def*0.4; procs de habilidades hardcodeadas + `CONSEJERO_ABILITY_LIST` con `CONSEJERO_PROC_CHANCE=1/6`; intercambia roles atacante/defensor cada ronda). Desempate por HP luego `power` L218-232.
- **`simulateRun.ts`** — `simulateRun(seed, deck, actionLog, name?)`:15, wrapper que exige actionLog completo y **acuña el `General` final** (llama `stepRun`, aplica bono de jefe, calcula power/tier, habilidades desbloqueadas).
- **`index.ts`** — barrel de re-exports, único punto de import recomendado.

---

## 3. Modelos de datos (`src/shared/types/index.ts`)

| Tipo | Línea | Qué representa |
|---|---|---|
| `Affinity` | 3 | `'OFE'\|'DEF'\|'MAN'` |
| `Consejero` | 5 | advisor: id, name, affinity, level, temporary?/expiresAt? |
| `Contracts`/`ContractColor` | 16-28 | sistema de contratos de reclutamiento + `contractMatches()` |
| `DeckSnapshot` | 32 | `Consejero[]` congelado al iniciar run |
| `RunAction`/`ActionLog` | 42-47 | unión discriminada `{kind:'train',choice}\|{kind:'rest'}\|{kind:'event',branch}` |
| `GeneralStats` | 49 | `{ofe, def, man}` |
| `EncounterResult` | 63 | resultado de encuentro dentro de una run |
| `TurnResult` | 80 | resultado de un turno de `stepRun` |
| `RunSimResult` | 107 | estado completo re-derivado de una run |
| `General` | 123 | **modelo del "personaje"**: id, ownerId, name, stats, power, tier, abilities, seed |
| `BattleRound`/`BattleResult` | 136/154 | ronda y resultado de combate 1v1 |
| `UserProfile` | 163 | userId, gold, settlementLevel |
| `DailyChallenge`/`DailyStatus`/`DailyClaimResult` | 176-191 | reto diario |
| `RecruitCandidate`/`RecruitmentState` | 201-210 | pantalla de reclutamiento |

---

## 4. Servidor (`src/server/`)

### 4.1 Entry point y proxy Devvit

- **`index.ts`** — Express app. Body parsing manual L30-46 (NO `express.json()`, rompería `AsyncLocalStorage` de Devvit). Inyección dev-only de `userId` L52-60. Montaje de routers L63-70 (`/api`→meta, `/api/run`→run, `/api/pvp`→pvp, `/api/daily`→daily, `/api/recruitment`→recruitment, `/api/internal`→internal, `/internal`→devvitInternal). Estático SPA L74-88. `startServer()` L91-115 (dev: `app.listen`; prod: `createServer(app)`+`getServerPort()`).
- **`devvitProxy/index.ts`** (687L) — abstrae Redis+contexto en 3 implementaciones: `InMemoryRedis` (test, L60-235), `localRedisProxy` (dev, ioredis con fallback a mock, L282-507), `devvitRedisProxy` (prod, delega en `webServer.redis`, L518-654). `export const redis` L664 = prod usa devvit, resto usa local **sin fallback silencioso en prod** (antes ocultaba fallos gRPC, ver memoria `grpc-context-failure-prod`). `export const context` L667-686 (Proxy que resuelve userId/postId/subredditName según entorno).

### 4.2 Rutas HTTP (`src/server/routes/`)

| Método + ruta | Archivo:línea | Qué hace |
|---|---|---|
| `GET /api/profile` | meta.ts:15 | perfil del usuario |
| `GET /api/consejeros` | meta.ts:27 | lista consejeros |
| `POST /api/consejeros/:id/level` | meta.ts:38 | sube nivel (idemp + rate limit) |
| `POST /api/create-post` | meta.ts:75 | crea post jugable desde cliente |
| `POST /api/run/start` | run.ts:10 | inicia run (valida deckSnapshot) |
| `POST /api/run/submit` | run.ts:40 | envía actionLog → acuña General |
| `GET /api/run/generals` | run.ts:70 | lista generales del usuario |
| `POST /api/pvp/battle` | pvp.ts:17 | matchmaking + simulateBattle + rewards |
| `GET /api/pvp/battle/:id` | pvp.ts:79 | replay de batalla (Redis TTL 24h) |
| `GET /api/pvp/leaderboard` | pvp.ts:97 | leaderboard paginado (zRange) |
| `GET /api/daily/challenge` | daily.ts:19 | reto diario + status |
| `POST /api/daily/battle` | daily.ts:31 | combate diario |
| `POST /api/daily/claim` | daily.ts:46 | reclama recompensa diaria |
| `GET /api/recruitment/` | recruitment.ts:15 | estado de reclutamiento |
| `POST /api/recruitment/loan` | recruitment.ts:24 | préstamo diario (rate limit) |
| `POST /api/recruitment/unlock` | recruitment.ts:35 | desbloqueo con contrato |
| `POST /api/internal/seed-npcs` | internal.ts:7 | fuerza seed de NPCs |
| `POST /internal/cron/daily-rollover` | devvitInternal.ts:86 | cron diario (devvit.json scheduler) |
| `GET /internal/test-post` | devvitInternal.ts:106 | diagnóstico creación de post |
| `POST /internal/menu/create-post` | devvitInternal.ts:161 | acción menú moderador |
| `POST /internal/on-install` | devvitInternal.ts:189 | trigger instalación/upgrade |

`devvitInternal.ts` también expone `createGamePost()`:27 y `createDailyPost()`:61 (llamadas por rutas de arriba, idempotentes vía Redis, usan `reddit.submitCustomPost`/`sticky`).

### 4.3 Lógica de negocio (`src/server/core/`)

| Archivo | Función clave:línea | Qué hace |
|---|---|---|
| `runs.ts` | `startRun()`:13, `submitRun()`:74 | ciclo de vida de la run (persiste `run:<id>` TTL 1800s, borra al consumir — anti-replay) |
| `rewards.ts` | `getUserProfile()`:14, `getUserConsejeros()`:56, `adjustGold()`:126 (watch/multi/retry), `recordBattleRewards()`:152, `levelConsejero()`:171 | perfil, oro, inventario, recompensas |
| `daily.ts` | `getOrCreateDailyChallenge()`:119, `resolveDailyBattle()`:163, `claimDaily()`:204 | reto diario (generación seedeada + idempotente) |
| `recruitment.ts` | `requestDailyLoan()`:86, `unlockWithContract()`:106 | préstamo 24h / desbloqueo con contrato+oro |
| `matchmaking.ts` | `findOpponent()`:7 (bandas 15→50→500), `searchPoolInBand()`:26 | matchmaking PvP por banda de poder (nota: TODO sin resolver sobre `zRem` real, L58-64) |
| `npc.ts` | `seedNPCs()`:21 | siembra 40 NPCs idempotente (guard `redis.get('npcs:seeded')`, clave no centralizada en keys.ts) |
| `advisors.ts` | `DEFAULT_CONSEJEROS`:41, `ACQUIRABLE_CONSEJEROS`:44, `ADVISOR_CATALOG`:47 | vista servidor del catálogo compartido |
| `generals.ts` | `getGeneral()`:5, `getUserGenerals()`:25 | lectura de Generales desde Redis |
| `auth.ts` | `getCurrentUserId()`:3, `verifyOwnership()`:11 | identidad + ownership |
| `keys.ts` | — | fábrica de claves Redis (ver §4.4) |
| `idempotency.ts` | `checkAndLockIdempotency()`:4, `saveIdempotency()`:33 | lock `SET NX` + cache de resultado |
| `rateLimit.ts` | `checkRateLimit()`:15 | contador atómico por ventana en hash |
| `diag.ts` | `logDevvitDiag()`:16 | diagnóstico temporal de bug gRPC (solo headers/nombres, no valores) |

### 4.4 Claves Redis (`core/keys.ts`)

`user:<id>`, `user:<id>:consejeros`, `user:<id>:contracts`, `user:<id>:loan`, `user:<id>:generals` (zset), `general:<gid>`, `pool:power` (zset matchmaking), `lb:season:<n>` (leaderboard), `battle:<bid>` (TTL), `idemp:<token>`, `rate:<action>:<id>`, `game:firstPost`, `daily:challenge:<date>`, `daily:post:<date>`, `daily:done:<date>:<id>`, `dailyclaim:<date>:<id>`.
Excepción no centralizada: `'npcs:seeded'` (literal en `core/npc.ts`).

### 4.5 Patrones cross-cutting del servidor

- **Transacción optimista**: `redis.watch(keys)` → leer estado → `redis.multi()`...`exec()` con retry loop (10 intentos) — usado en `rewards.ts` (`adjustGold`, `levelConsejero`) y `recruitment.ts` (`grantContract`, `unlockWithContract`).
- **Idempotencia + rate limit**: casi toda ruta mutante aplica `checkAndLockIdempotency`/`saveIdempotency` + `checkRateLimit` antes de tocar estado (ver run.ts, pvp.ts, daily.ts, recruitment.ts, meta.ts).
- **Reddit/Devvit API directa** solo en `routes/devvitInternal.ts` (submitCustomPost/submitPost/getPostById/sticky/getCurrentSubreddit) y `core/diag.ts`; todo lo demás pasa por `devvitProxy`.

---

## 5. Dónde tocar para... (índice inverso rápido)

- **Cambiar balance de stats/energía/mood** → `shared/sim/balance.ts`
- **Cambiar reglas de dados/umbrales** → `shared/sim/dice.ts`
- **Añadir/editar un consejero** → `shared/sim/consejeroCatalog.ts` (ROWS) + `server/core/advisors.ts` si cambia disponibilidad
- **Cambiar lógica de combate 1v1** → `shared/sim/simulateBattle.ts`
- **Cambiar el loop de turnos de la run** → `shared/sim/stepRun.ts`
- **Cambiar UI de botones/paneles genéricos** → `client/ui/widgets.ts` + `client/ui/theme.ts`
- **Cambiar animación de batalla 6v6** → `client/scenes/PvpCombatScene.ts` + `client/combat/army.ts`
- **Añadir un asset nuevo** → `client/assets.ts` (registrar) + `client/scenes/BootScene.ts` (precargar) o `client/combat/combatAssets.ts` (si es de combate, lazy)
- **Añadir un endpoint** → `server/routes/*.ts` + lógica en `server/core/*.ts` correspondiente
- **Cambiar claves Redis** → `server/core/keys.ts`
- **Debug de fallos Devvit/gRPC** → `server/devvitProxy/index.ts` + `server/core/diag.ts` (ver memoria `grpc-context-failure-prod`)
