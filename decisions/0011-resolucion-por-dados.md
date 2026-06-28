# ADR-0011: Resolución por dados sembrados como capa de cálculo de la run

## Status
Accepted

## Context
Hasta ahora cada decisión de entrenamiento se resolvía con una tirada continua
oculta (`prng.nextFloat()` comparada contra `failChance`/`critChance`), los eventos
con coin-flips inline (`p.nextFloat() < 0.5`) y las habilidades de combate con procs
sueltos (`prng.nextInt(1,5)===1`). El cálculo era invisible para el jugador y los
consejeros se autoseleccionaban (`bestAdvisorFor`), sin decisión real.

Queremos que **los dados sean el mecanismo visible y real de cálculo** en cada
decisión, que **los modificadores y habilidades con probabilidad usen dados**, y que
**el jugador asigne consejeros a cada entrenamiento**. Todo esto debe respetar el
límite de integridad del ADR-0001: el cliente no tiene autoridad y el servidor
re-simula `(seed, deckSnapshot, actionLog)` para obtener el mismo resultado.

## Decision
Se añade un **motor de dados determinista** (`src/shared/sim/dice.ts`) que deriva
toda tirada del PRNG sembrado de la run/batalla. Reglas:

- **Dado base = 1d6.** Cada cara cruda sale de `prng.nextInt(1,6)`; **una cara
  física = exactamente una llamada `nextInt(1,6)`.**
- **Dados restringibles:** un dado declara `allowed`, un subconjunto ordenado de
  `1..6`. La cara final es `allowed[(raw-1) % allowed.length]`. Un dado puede quedar
  bloqueado a un valor (`[2]`), limitado a un rango (`[2,3,4]`) o completo (`[1..6]`).
  **La restricción NO cambia cuántos valores PRNG se consumen**, solo cómo se
  interpreta el valor: así añadir/quitar una restricción nunca desincroniza el stream
  entre cliente y servidor.
- **Umbrales de banda** sobre la cara resultante: `cara <= failMax → FALLO`,
  `cara >= critMin → CRÍTICO`, intermedio → `NORMAL` (por defecto `failMax=1`,
  `critMin=6`, tunables en `balance.ts`).
- **Multi-dado** con `combine` `'best'` (ventaja) o `'worst'` (desventaja); la cara
  combinada se mantiene en `1..6`, así los umbrales no dependen del número de dados.
- **Modificadores** (consejeros, energía, habilidades) son transformaciones puras
  `DiceRoll → DiceRoll`: reforman el dado (subir el piso del rango), mueven los
  umbrales y/o añaden dados de ventaja.

**Asignación de consejeros (anti-cheat):** el jugador asigna un subconjunto del deck
a cada entrenamiento. Como esa elección afecta el resultado, **`consejeroIds` viaja
dentro del `actionLog`** (acción `train`), y `validateActionLog` rechaza ids que no
pertenezcan al `deckSnapshot`. El servidor re-deriva la tirada con su deck
autoritativo.

**Afinidad / vínculo (`bond`):** cada participación acumula `bond` para ese consejero
**durante la run** (no se persiste; se re-deriva de `seed+deck+actionLog` para que
`simulateRun` siga siendo pura). Al cruzar `BOND_THRESHOLD`, se **desbloquea la
habilidad de combate** del consejero, que se une a las habilidades por umbral de stat
en el general acuñado. En código el campo se llama `bond` para no colisionar con el
tipo `Affinity` (OFE/DEF/MAN); la UI lo rotula "Afinidad".

## Consequences
- El cálculo es legible y deterministamente reproducible: la animación del dado es
  "teatro" que aterriza en la cara que ya fijó el motor.
- `consejeroIds` en el `actionLog` mantiene el anti-cheat: el servidor recomputa la
  misma tirada y rechaza ids ajenos al deck.
- **Bump `SIM_VERSION = 2`**: cambia la forma del `actionLog` (`train` exige
  `consejeroIds`) y el stream PRNG de combate (`nextInt(1,5)` → `nextInt(1,6)`). Los
  `actionLog`/replays previos quedan inválidos; aceptable porque el proyecto es
  pre-lanzamiento. Los generales ya acuñados conservan sus stats guardadas (no se
  re-simulan).
- El balance se re-tunea: fallo/crítico ahora dependen de umbrales d6 (constantes en
  `balance.ts`).
- Se mantiene la restricción dura del ADR-0001: el motor de dados **MUST NOT** usar
  `Math.random` ni `Date.now`; toda aleatoriedad sale del PRNG sembrado.

## Alternatives considered
- **Dados decorativos** (mantener `failChance`/`critChance` y solo animar): menos
  fiel a "cálculo de estadísticas con dados" y los modificadores no serían reales.
  Rechazada.
- **Sumar 2d6** en vez de quedarse en `1..6` (keep-best): obligaría a re-escalar
  umbrales por número de dados y a una UI menos legible. Rechazada.
- **Persistir `bond` en Redis** como meta-progresión: rompería la pureza de
  `simulateRun` (el general dependería de estado mutable oculto). Rechazada; el
  vínculo es por-run. El nivel del consejero sigue siendo la meta-progresión persistente.
