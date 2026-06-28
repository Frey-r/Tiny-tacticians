# Project: Tiny Tacticians (working title)

Roguelike de gestión militar para **Reddit / Devvit Web**. El jugador entrena a un
general en runs cortas (8 turnos, 3 stats), lo "acuña" como entidad inmutable y lo
lanza a un PvP asíncrono de fantasmas. La metaprogresión (recursos, niveles de
consejeros, asentamiento) y los eventos diarios constituyen el gancho de retención.

## Plataforma y restricciones duras

- Runtime: **Node.js serverless** provisto por Devvit Web. Sin estado en proceso entre requests.
- Persistencia: **Redis gestionado por Devvit** (`@devvit/web/server`). Único almacén de estado.
- Tareas recurrentes: **scheduler/cron** de Devvit.
- Límites de plataforma: request ≤ **30 s**, payload ≤ **4 MB**, respuesta ≤ **10 MB**.
- Cliente (webview Phaser/React): renderiza y previsualiza. **No tiene autoridad sobre el estado.**

## Principio rector (límite de integridad)

Toda salida que afecte al PvP o a la economía se **computa o se re-simula en el servidor**.
El cliente solo envía intenciones acotadas (un `actionLog`). Ver `decisions/0001`.

## Capabilities (specs/)

| Capability          | Responsabilidad                                                        |
|---------------------|------------------------------------------------------------------------|
| `simulation-engine` | PRNG sembrado + `simulateRun` / `simulateBattle` deterministas + replay |
| `dice-resolution`   | Motor de dados sembrados (restringibles, umbrales) para runs/eventos/procs |
| `run-training`      | Ciclo de vida de la run y acuñación del general                        |
| `combat-pvp`        | Matchmaking por poder, batalla determinista, recompensas               |
| `daily-events`      | Reto diario, reclamo de recompensas, adquisición de consejeros         |
| `meta-progression`  | Ledger de recursos, niveles de consejero, asentamiento, versionado     |
| `security`          | Requisitos no funcionales transversales de integridad y abuso          |

> **Glosario:** "afinidad de consejero" (vínculo / `bond` en código) es un puntaje que
> se acumula por-run al usar un consejero en entrenamientos y desbloquea su habilidad de
> combate. Es distinto del **tipo de afinidad** (`Affinity` = OFE/DEF/MAN). Ver
> `decisions/0011` y `specs/dice-resolution`.

## Decisiones de arquitectura (decisions/)

ADRs persistentes (schema `spec-driven-with-adr`) sobre el servicio: manejo de
conexiones, concurrencia y acceso a Redis. Ver `decisions/`.

## Convenciones de specs

- Las specs son **contratos de comportamiento**, no diseño. El "cómo" va en ADRs y `tasks.md`.
- Requisitos: `### Requirement: <nombre>` con palabras clave RFC-2119 (MUST/SHALL/SHOULD/MAY).
- Escenarios: `#### Scenario: <nombre>` en formato GIVEN / WHEN / THEN / AND, testeables.
- Cada capability incluye 3-5 escenarios *happy path* y 3-5 *sad path*.

## Flujo de cambios

El trabajo nuevo se propone como un cambio en `openspec/changes/<id>/` (proposal.md,
specs/ delta, design.md, tasks.md) y al archivarse se fusiona en `openspec/specs/`.
Estas specs son la línea base ya establecida.

## Stack

TypeScript · Node.js 22+ · `@devvit/web` (server/client/shared) · Redis (Devvit) ·
Phaser o React en el cliente · Vitest para pruebas de determinismo.
