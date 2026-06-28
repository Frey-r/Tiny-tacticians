# Simulation Engine

Motor determinista compartido (`@devvit/web/shared`) importado por cliente y servidor.
Es el límite de integridad del sistema: el cliente lo usa para previsualizar; el servidor
lo usa como única fuente de verdad re-simulando las mismas entradas.

## Purpose

Garantizar que `(seed, deckSnapshot, actionLog)` produzca siempre el mismo `General`, y que
`(seed, generalA, generalB)` produzca siempre el mismo `BattleResult`, en cualquier entorno.

## Requirements

### Requirement: Seeded Pseudo-Random Generation
El motor SHALL derivar toda aleatoriedad de un PRNG inicializado con una semilla explícita.
El motor MUST NOT usar `Math.random`, relojes de pared (`Date.now`), ni ningún estado global
o ambiental.

#### Scenario: Misma semilla, misma secuencia (happy)
- GIVEN dos instancias del PRNG inicializadas con la semilla `S`
- WHEN cada una genera 100 valores
- THEN ambas secuencias son idénticas elemento a elemento

#### Scenario: Detección de fuente no determinista (sad)
- GIVEN una build del motor que invoca una fuente de entropía prohibida
- WHEN la suite de determinismo ejecuta la misma entrada dos veces
- THEN los resultados difieren
- AND la prueba de determinismo falla y bloquea el merge

#### Scenario: Tiradas de dados deterministas (happy)
- GIVEN un `DiceRoll` resuelto con el PRNG sembrado de la run
- WHEN se re-simula la run con la misma semilla, deck y actionLog
- THEN cada turno produce las mismas caras de dado y la misma banda
- AND el contrato de consumo (una extracción por dado) se mantiene (ver `dice-resolution`)

### Requirement: Deterministic Run Simulation
El motor SHALL exponer `simulateRun(seed, deckSnapshot, actionLog) -> General` como función pura.
El resultado SHALL ser idéntico independientemente de si se ejecuta en cliente o servidor.

#### Scenario: Replay cliente vs servidor coincide (happy)
- GIVEN un `actionLog` válido de 8 turnos producido en el cliente con semilla `S` y deck `D`
- WHEN el servidor ejecuta `simulateRun(S, D, actionLog)`
- THEN el `General` del servidor es idéntico (stats, habilidades, poder) al previsualizado en cliente

#### Scenario: Eventos de campaña deterministas (happy)
- GIVEN una run con semilla `S` y un deck que habilita un conjunto de eventos
- WHEN se re-simula con `S`
- THEN los mismos eventos se disparan en los mismos turnos con los mismos resultados

#### Scenario: Poder dentro de cotas alcanzables (happy)
- GIVEN un `actionLog` óptimo legal de 8 turnos
- WHEN se simula la run
- THEN el poder resultante cae dentro del rango de balance definido (cota inferior y superior)

#### Scenario: actionLog fuera de longitud (sad)
- GIVEN un `actionLog` con 9 acciones para una run de 8 turnos
- WHEN se invoca `simulateRun`
- THEN el motor rechaza la entrada con un error de validación
- AND no se produce ningún `General`

#### Scenario: Acción referencia un consejero ausente (sad)
- GIVEN un `actionLog` que entrena con un consejero que no está en `deckSnapshot`
- WHEN se invoca `simulateRun`
- THEN el motor rechaza la entrada como inválida

### Requirement: Deterministic Battle Simulation
El motor SHALL exponer `simulateBattle(seed, generalA, generalB) -> BattleResult` como función pura,
incluyendo el log ronda a ronda necesario para reproducir la animación en cliente.

#### Scenario: Batalla reproducible (happy)
- GIVEN dos generales `A` y `B` y una semilla de batalla `Sb`
- WHEN cliente y servidor ejecutan `simulateBattle(Sb, A, B)`
- THEN obtienen el mismo ganador y el mismo log de rondas

#### Scenario: Simetría de intercambio controlada (sad)
- GIVEN la misma pareja con orden de argumentos invertido y la misma semilla
- WHEN se resuelve la batalla
- THEN el resultado respeta las reglas de iniciativa por Mando de forma determinista
- AND no depende del orden posicional de los argumentos salvo por dichas reglas

### Requirement: Bounded Numeric Safety
El motor SHALL acotar (clamp) stats y daños a rangos válidos y MUST NOT producir `NaN`,
`Infinity` ni desbordamientos.

#### Scenario: Saturación de stats (sad)
- GIVEN entradas que empujarían una stat por encima del máximo
- WHEN se simula
- THEN la stat se satura en el máximo definido sin `NaN` ni overflow
