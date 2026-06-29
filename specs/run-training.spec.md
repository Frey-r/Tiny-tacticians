# Run Training

Ciclo de vida de una run de entrenamiento: el servidor emite la semilla y el deck, el cliente
juega localmente, y el servidor re-simula al enviar para acuñar un general inmutable.

## Requirements

### Requirement: Start Run
El servidor SHALL, ante una petición de inicio, generar un `runId` y una `seed`, persistir el
estado de la run con expiración, y devolver al cliente la `seed` y el `deckSnapshot` del loadout.
La `seed` y el `deckSnapshot` SHALL ser determinados por el servidor, nunca por el cliente.

#### Scenario: Inicio de run entrega semilla y deck (happy)
- GIVEN un usuario autenticado con un loadout de 3 consejeros
- WHEN solicita iniciar una run
- THEN el servidor crea `runId` + `seed`, persiste la run como abierta con TTL
- AND devuelve `seed` y `deckSnapshot` al cliente

#### Scenario: Loadout inválido al iniciar (sad)
- GIVEN un usuario cuyo loadout referencia un consejero que no posee
- WHEN solicita iniciar una run
- THEN el servidor rechaza la petición
- AND no se crea ninguna run

### Requirement: Submit Run And Mint General
El servidor SHALL, al recibir el `actionLog`, re-simular la run con la `seed` y el `deckSnapshot`
originales mediante `simulation-engine`, y acuñar un `General` **inmutable** con el resultado
autoritativo. El general acuñado SHALL incorporarse al pool de fantasmas para PvP.

#### Scenario: Envío válido acuña general (happy)
- GIVEN una run abierta y un `actionLog` válido de 8 turnos
- WHEN el usuario envía el `actionLog`
- THEN el servidor re-simula, acuña un `General` con stats/tier/poder autoritativos
- AND lo registra como propiedad del usuario
- AND lo añade al pool de matchmaking

#### Scenario: El general acuñado es inmutable (happy)
- GIVEN un general recién acuñado
- WHEN cualquier flujo posterior intenta modificar sus stats
- THEN la operación no está permitida y el general permanece tal cual fue acuñado

#### Scenario: Stats reclamadas por el cliente son ignoradas (sad)
- GIVEN un envío que incluye stats finales calculadas por el cliente
- WHEN el servidor procesa el envío
- THEN el servidor descarta las stats del cliente y usa exclusivamente su re-simulación
- AND si difieren, registra la discrepancia para telemetría de abuso

#### Scenario: actionLog que falla validación (sad)
- GIVEN un `actionLog` con una acción ilegal o fuera de cota
- WHEN se envía
- THEN el servidor rechaza el envío sin acuñar general

### Requirement: Idempotent Submission
El envío de una run SHALL aceptar un token de idempotencia. Reintentos con el mismo token
SHALL devolver el mismo general sin acuñar duplicados.

#### Scenario: Reintento por red móvil inestable (happy)
- GIVEN un envío que se reintenta con el mismo token de idempotencia tras un timeout de red
- WHEN el servidor recibe el segundo intento
- THEN devuelve el general ya acuñado
- AND no acuña un segundo general ni duplica recompensas

### Requirement: Run Expiry And Replay Protection
Una run abierta SHALL expirar tras una ventana configurable. Un envío contra un `runId`
inexistente, ya consumido o expirado SHALL ser rechazado.

#### Scenario: Envío contra run expirada (sad)
- GIVEN una run cuyo TTL ya venció
- WHEN el usuario envía su `actionLog`
- THEN el servidor rechaza el envío como expirado
- AND no acuña general

#### Scenario: Reuso de una run ya consumida (sad)
- GIVEN una run que ya fue enviada y cerrada
- WHEN llega un envío distinto para el mismo `runId` (token de idempotencia diferente)
- THEN el servidor lo rechaza por run ya consumida

### Requirement: Run Throttling
El servidor SHALL aplicar un tope de runs por usuario por ventana de tiempo para evitar
inundar el pool de fantasmas.

#### Scenario: Tope diario de runs alcanzado (sad)
- GIVEN un usuario que alcanzó su tope de runs en la ventana actual
- WHEN intenta iniciar otra run
- THEN el servidor rechaza la petición indicando el límite
- AND no consume cuota adicional

### Requirement: Dice-Resolved Decisions
Cada entrenamiento y cada rama de evento con probabilidad SHALL resolverse mediante el
motor `dice-resolution` usando el PRNG sembrado de la run. El resultado (FALLO / NORMAL
/ CRÍTICO) SHALL determinar la ganancia: FALLO = 0, NORMAL = ganancia base, CRÍTICO =
ganancia base por el multiplicador de crítico. El descanso NO tira dado (recuperación
determinista).

#### Scenario: Entrenamiento resuelto por dados (happy)
- GIVEN un turno de entrenamiento de afinidad `OFE`
- WHEN el jugador lo confirma
- THEN se tira el dado armado desde los modificadores y la energía
- AND la banda resultante fija la ganancia aplicada a la stat

### Requirement: Consejero Activation Per Training
Los consejeros del loadout NO se asignan por turno (ya no son clickeables in-run). En cada
turno de entrenamiento, cada consejero del `deckSnapshot` SHALL activarse al azar de forma
DETERMINISTA derivada de `(seed, turno)` (PRNG `seed:act:<turno>`, independiente del stream
del dado). La probabilidad de activación SHALL subir linealmente con el progreso de la run
(≈5% en el primer turno hasta ≈75% en el último), sesgada por consejero (`activationBias`).
Pueden quedar entre 0 y `LOADOUT_SIZE` consejeros activos por turno. La acción `train` SHALL
llevar SOLO la afinidad (sin `consejeroIds`). Solo los consejeros ACTIVOS reforman la tirada
—según su arquetipo de entrenamiento (maestro/alquimista/intendente)— y detonan su efecto de
run (ver decisions/0012).

#### Scenario: Activación aleatoria reproducible (happy)
- GIVEN un loadout de 3 consejeros y una `seed`
- WHEN se re-simula la run en cliente y servidor
- THEN el conjunto de consejeros activos por turno coincide exactamente (determinista)
- AND la probabilidad media de activación es mayor en turnos tardíos que en los iniciales

#### Scenario: La acción train no transporta consejeros (happy)
- GIVEN una acción `train`
- WHEN el servidor valida el `actionLog`
- THEN solo exige una afinidad válida (OFE/DEF/MAN); no hay `consejeroIds` que validar

### Requirement: Bond Accrual And Ability Unlock
La activación de un consejero en entrenamientos SHALL acumular su `bond` (afinidad) durante
la run. El `bond` SHALL ser por-run y derivado de `(seed, deck, actionLog)` —el set activo es
función de `(seed, turno)`—, sin persistirse. Al cruzar el umbral de `bond`, la habilidad de
combate del consejero SHALL unirse a las habilidades del general acuñado (junto con las
habilidades por umbral de stat).

#### Scenario: Desbloqueo de habilidad por afinidad (happy)
- GIVEN un consejero que participa en suficientes entrenamientos para cruzar el umbral de bond
- WHEN se acuña el general al terminar la run
- THEN la habilidad de ese consejero aparece en las habilidades del general

#### Scenario: Bond por debajo del umbral no desbloquea (sad)
- GIVEN un consejero que participa una sola vez
- WHEN se acuña el general
- THEN su habilidad NO se añade al general
