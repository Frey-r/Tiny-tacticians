# Dice Resolution

Capa de cálculo por dados sembrados (`src/shared/sim/dice.ts`) usada por la run, los
eventos y los procs de habilidades de combate. Es parte del motor determinista: las
mismas entradas producen las mismas caras en cliente y servidor.

## Requirements

### Requirement: Deterministic Dice Rolls
El motor de dados SHALL derivar toda tirada del PRNG sembrado vía `prng.nextInt(1,6)`
y MUST NOT usar `Math.random` ni relojes de pared. Una tirada de N dados SHALL
consumir exactamente N valores del PRNG, en orden de índice.

#### Scenario: Misma semilla, mismas caras (happy)
- GIVEN un `DiceRoll` y dos PRNG inicializados con la misma semilla
- WHEN se ejecuta `rollDice` con cada uno
- THEN ambas tiradas devuelven las mismas caras, la misma cara combinada y la misma banda

#### Scenario: Consumo de PRNG acotado (happy)
- GIVEN un `DiceRoll` con K dados
- WHEN se ejecuta `rollDice`
- THEN el PRNG avanza exactamente K extracciones, independientemente de las restricciones de cada dado

#### Scenario: Cliente y servidor coinciden (happy)
- GIVEN una run resuelta en el cliente con semilla `S`, deck `D` y `actionLog`
- WHEN el servidor re-simula con `S`, `D` y el mismo `actionLog`
- THEN las caras de cada turno coinciden elemento a elemento

### Requirement: Constrained Dice
Un dado SHALL declarar sus caras posibles como un subconjunto ordenado y no vacío de
`1..6`. La restricción SHALL mapear la cara cruda a una cara permitida sin consumir
PRNG adicional.

#### Scenario: Dado bloqueado a un valor (happy)
- GIVEN un dado restringido a `[2]`
- WHEN se tira
- THEN siempre devuelve la cara 2 y aun así consume una extracción del PRNG

#### Scenario: Dado limitado a un rango (happy)
- GIVEN un dado restringido a `[2,3,4]`
- WHEN se tira muchas veces
- THEN solo aparecen caras en `{2,3,4}`

#### Scenario: Restricción inválida saneada (sad)
- GIVEN una lista de caras con valores fuera de `1..6`, repetidos o vacía
- WHEN se construye el dado
- THEN se saturan a `1..6`, se de-duplican y se ordenan, con longitud mínima 1

### Requirement: Threshold And Modifier Effects
Los modificadores SHALL ser transformaciones puras `DiceRoll → DiceRoll`: reformar el
dado base, mover los umbrales (`failMax`/`critMin`) y/o añadir dados de ventaja. Los
umbrales resultantes SHALL acotarse a enteros con `0 <= failMax < critMin <= 7` y MUST
NOT producir `NaN` ni `Infinity`.

#### Scenario: El consejero hace el crítico más probable (happy)
- GIVEN un entrenamiento con un consejero afín de nivel alto
- WHEN se arma la tirada
- THEN el dado base sube su piso y/o baja `critMin`, aumentando la probabilidad de CRÍTICO

#### Scenario: La energía baja aumenta el fallo (happy)
- GIVEN un entrenamiento con energía por debajo del umbral seguro
- WHEN se arma la tirada
- THEN `failMax` sube y más caras caen en la banda FALLO

#### Scenario: Umbrales acotados (sad)
- GIVEN modificadores que empujarían `failMax` por encima de `critMin`
- WHEN se arma la tirada
- THEN los umbrales se acotan para que la banda NORMAL siga siendo coherente, sin overflow
