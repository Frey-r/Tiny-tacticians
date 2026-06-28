# Combat PvP

PvP asíncrono de fantasmas: el jugador desafía a generales almacenados de otros usuarios. El
servidor resuelve la batalla de forma determinista; no hay sincronía en tiempo real.

## Requirements

### Requirement: Power-Banded Matchmaking
El servidor SHALL emparejar al general atacante con un oponente del pool cuyo poder esté dentro
de una banda alrededor del poder del atacante. El emparejamiento SHALL excluir los generales
propios del usuario y los enfrentados muy recientemente.

#### Scenario: Emparejamiento dentro de banda (happy)
- GIVEN un pool con varios generales y un atacante de poder `P`
- WHEN el usuario solicita una batalla
- THEN el servidor selecciona un oponente con poder en `[P - banda, P + banda]`
- AND el oponente no pertenece al usuario

#### Scenario: Exclusión del propio general (sad)
- GIVEN un usuario cuyos generales son los únicos en la banda de poder
- WHEN solicita una batalla
- THEN el servidor no lo empareja consigo mismo
- AND amplía la banda o recurre al fallback de NPC

### Requirement: Empty Pool Fallback
Cuando no exista oponente humano elegible, el servidor SHALL emparejar contra un general NPC
sembrado, de modo que la experiencia nunca quede sin oponente (cold start de comunidad).

#### Scenario: Pool sin humanos elegibles (happy)
- GIVEN un pool sin generales humanos en la banda (p. ej. demo recién publicada)
- WHEN un usuario solicita una batalla
- THEN el servidor empareja contra un NPC de poder comparable
- AND la batalla se resuelve con normalidad

### Requirement: Deterministic Battle Resolution
El servidor SHALL resolver la batalla con `simulation-engine` usando una semilla derivada de
forma reproducible, y SHALL persistir el resultado con su semilla para permitir el replay y el
comentario de "war report".

#### Scenario: Resolución y replay (happy)
- GIVEN dos generales emparejados y una semilla de batalla `Sb`
- WHEN el servidor resuelve la batalla
- THEN devuelve ganador, log de rondas y referencia de replay
- AND reproducir con `Sb` rinde exactamente el mismo resultado

### Requirement: Dice-Resolved Ability Procs
Las habilidades con probabilidad SHALL procar mediante el motor `dice-resolution` con el
PRNG sembrado de la batalla. Las habilidades de combate desbloqueadas por afinidad de
consejero (ver `run-training`) SHALL participar en la batalla como cualquier otra habilidad
del general.

#### Scenario: Habilidad desbloqueada por consejero proca en combate (happy)
- GIVEN un general cuyas habilidades incluyen una desbloqueada por afinidad de consejero
- WHEN se resuelve una batalla
- THEN esa habilidad puede procar vía dado y aparece en `abilityProcs`
- AND la batalla sigue siendo reproducible con la misma semilla

### Requirement: Atomic Idempotent Rewards
El acreditar recursos al ganador SHALL realizarse con operaciones atómicas y SHALL ser
idempotente respecto del identificador de batalla, de modo que reintentos no dupliquen
recompensas ni puntuación de leaderboard.

#### Scenario: Victoria acredita recursos y ranking (happy)
- GIVEN una batalla resuelta con victoria del atacante
- WHEN el servidor aplica las recompensas
- THEN incrementa los recursos del ganador de forma atómica
- AND actualiza el leaderboard de forma atómica

#### Scenario: Resolución duplicada por reintento (sad)
- GIVEN una batalla ya resuelta y acreditada
- WHEN llega un reintento con el mismo identificador de batalla
- THEN el servidor devuelve el resultado existente
- AND no acredita recursos ni puntos por segunda vez

### Requirement: Stale Opponent Handling
Si el general oponente seleccionado expira (TTL) o desaparece entre la selección y la
resolución, el servidor SHALL re-emparejar en lugar de fallar.

#### Scenario: Oponente expira a mitad de flujo (sad)
- GIVEN un oponente seleccionado cuyo registro caduca antes de resolver
- WHEN el servidor intenta resolver la batalla
- THEN re-empareja con otro oponente elegible
- AND la petición del usuario termina con una batalla válida

#### Scenario: Petición de batalla malformada (sad)
- GIVEN una petición sin `generalId` del atacante o con uno que el usuario no posee
- WHEN llega al servidor
- THEN el servidor la rechaza por entrada inválida o no autorizada
- AND no se resuelve ninguna batalla
