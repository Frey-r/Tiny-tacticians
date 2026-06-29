# ADR-0012: Activación aleatoria de consejeros y pool de 40 (framework data-driven)

## Status
Accepted

## Context
El ADR-0011 hizo que el jugador **asignara** consejeros a cada turno de entrenamiento
(`consejeroIds` en el `actionLog`) y que cada consejero reformara el dado de forma
**uniforme por nivel** (`consejeroDieMod`). El pool era de **9 consejeros** (c1..c9) con
3 afinidades (OFE/DEF/MAN) y una skill de combate única por id.

Queremos:
1. **Quitar el micro-management in-run.** Los consejeros del loadout YA NO son clickeables;
   se activan al azar cada turno, con probabilidad que sube de 5% a 75% a lo largo de la run,
   y 0–3 activos por turno.
2. **Crecer el pool a 40 consejeros**, que pueden COMPARTIR skill de combate pero se
   diferencian por su **probabilidad de activarse** y por el **efecto que detonan en la run**.
3. **Refinar los arquetipos** de entrenamiento en algo accionable y data-driven.

Restricción dura (ADR-0001 / ADR-0011): el cliente no tiene autoridad; el servidor re-simula
`(seed, deckSnapshot, actionLog)` y obtiene el mismo resultado. Toda aleatoriedad sale del PRNG
sembrado (nunca `Math.random`/`Date.now`).

## Decision

**Catálogo único (`src/shared/sim/consejeroCatalog.ts`).** Fuente única de los 40 consejeros:
identidad (nombre/afinidad) + gameplay (`trainStyle`, `activationBias`, `runEffectId`) + skill
de combate COMPARTIDA (`abilityKey`). `consejeroAbilities.ts` y `server/core/advisors.ts`
derivan de aquí. c1..c9 conservan su identidad previa (usuarios existentes ya los poseen en
Redis); c10..c40 amplían el pool. El tipo `Consejero` y el `deckSnapshot` NO cambian (la
metadata de gameplay se resuelve por id, igual que las habilidades en el ADR-0011).

**Activación determinista por turno.** En cada turno de entrenamiento:
- `activationRamp(turno)` = interpolación lineal de `ACTIVATION_MIN=0.05` (turno 0) a
  `ACTIVATION_MAX=0.75` (último turno).
- `activationChance(c, turno)` = `clamp(activationRamp + activationBias, 0.05, 0.95)`.
- `activeAdvisorsForTurn(seed, deck, turno)` tira UNA vez por consejero (orden estable del deck)
  con un **PRNG derivado `seed:act:<turno>`** —independiente del stream del dado, mismo patrón
  que `eventTurns` con `seed:evt`—. El resultado es 0..`LOADOUT_SIZE` activos, determinista y
  previsualizable (el preview muestra quién asiste; solo el d6 es aleatorio).

**La acción `train` pierde `consejeroIds`** (`{ kind:'train', choice }`). `validateActionLog`
ya no valida ids; solo la afinidad. Menos superficie de validación.

**Tres arquetipos de entrenamiento** (`trainStyle`, reforman el dado distinto; off-afinidad no
reforma):
- `maestro` — **polariza**: +crítico (baja `critMin`) y +fallo (sube `failMax`). Alto riesgo.
- `alquimista` — **estabiliza**: sube el piso (quita fallo) pero BLOQUEA la cara máxima (limita
  el crítico).
- `intendente` — **eficiencia**: dado casi neutro; reembolsa energía y regala stat secundaria
  en éxito.

**Efectos de run (`runEffectId`, el diferenciador).** Cuando un consejero activo los lleva, su
efecto se pliega al turno de forma determinista: `energiaPrevista` (reembolso de energía),
`vinculoFervido` (bond extra), `botinDeGuerra` (stat secundaria), `segundaIntencion` (−failMax
ese turno), `ojoCritico` (−critMin ese turno). Dos consejeros con la misma skill de combate se
distinguen por su `runEffectId` + `activationBias`.

**Bond** sigue siendo por-run (no se persiste) y desbloquea la skill de combate al cruzar
`BOND_THRESHOLD`; ahora se acumula para los consejeros **activos** (no asignados). Combate se
reusa sin cambios: resuelve por NOMBRE de habilidad, y la lista de skills (`CONSEJERO_ABILITY_LIST`)
es ÚNICA por `abilityKey`, así varios consejeros que comparten skill no la procan dos veces.

## Consequences
- **Bump `SIM_VERSION = 3`**: cambia la forma del `actionLog` (`train` sin `consejeroIds`). Los
  `actionLog`/replays previos quedan inválidos; aceptable (pre-lanzamiento). Los generales ya
  acuñados conservan sus stats guardadas.
- El loadout se sigue eligiendo en la preparación (`RunSetupScene`): la meta-progresión de
  reclutar/subir nivel se conserva; lo que desaparece es el micro-management por turno.
- El balance se re-tunea: con activación baja al inicio, el bond se acumula más lento; el efecto
  `vinculoFervido` y la calibración de `activationBias`/arquetipos compensan.
- Las 5 "arquetipos de habilidad" de combate ricos (Dicer/dados truncados, Disruptor, etc.) se
  DIFIEREN: los 40 reusan los 4 efectos de combate actuales.

## Alternatives considered
- **Sortear los activos del roster completo** (sin loadout): elimina la estrategia de armar
  loadout y la meta-progresión de reclutamiento. Rechazada.
- **Añadir una 4ª afinidad "Horda"/comodín** (arquetipo Apostador): ripple en tipos/contratos sin
  4ª stat entrenable. Rechazada por petición explícita.
- **Guardar la metadata de gameplay en el `deckSnapshot`**: inflaría el snapshot y la validación.
  Rechazada; se resuelve por id desde el catálogo compartido.
