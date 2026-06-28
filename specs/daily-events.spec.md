# Daily Events

Capa meta diaria: un reto diario generado por el scheduler que entrega recursos y, con cierta
probabilidad, nuevos consejeros. Es el gancho de retención y el contenido recurrente que premia
el jurado de la jam. (Distinto de los *eventos de campaña* internos a la run.)

## Requirements

### Requirement: Daily Challenge Generation
El scheduler SHALL generar el reto del día con una `seed`, un enemigo/modificador y un post
asociado, identificado por la fecha canónica (UTC). La generación SHALL ser idempotente: una
segunda ejecución para la misma fecha no crea un reto duplicado.

#### Scenario: Generación diaria por cron (happy)
- GIVEN que aún no existe reto para la fecha de hoy
- WHEN el scheduler ejecuta el rollover diario
- THEN crea el reto con su semilla y publica el post asociado
- AND almacena la referencia del post

#### Scenario: Cron ejecuta dos veces (sad)
- GIVEN un reto ya creado para la fecha de hoy
- WHEN el scheduler vuelve a ejecutar el rollover para esa fecha
- THEN la operación es un no-op idempotente
- AND no se crea un segundo reto ni un segundo post

### Requirement: Lazy Daily Creation
Si una petición de cliente requiere el reto del día y este no existe (p. ej. el cron no se
disparó), el servidor SHALL crearlo perezosamente de forma idempotente. El juego nunca SHALL
romperse por un cron caído.

#### Scenario: Creación perezosa cuando el cron falló (happy)
- GIVEN que el cron no creó el reto de hoy
- WHEN el primer usuario del día solicita el reto
- THEN el servidor crea el reto de hoy de forma idempotente
- AND el usuario recibe un reto válido

### Requirement: Once-Per-Day Idempotent Claim
El reclamo de la recompensa diaria SHALL acreditarse una sola vez por usuario y por fecha, de
forma atómica e idempotente.

#### Scenario: Reclamo válido tras completar el reto (happy)
- GIVEN un usuario que completó el objetivo del reto de hoy y no ha reclamado
- WHEN reclama la recompensa
- THEN el servidor acredita los recursos una vez
- AND marca el reclamo del día para ese usuario

#### Scenario: Doble reclamo el mismo día (sad)
- GIVEN un usuario que ya reclamó hoy
- WHEN intenta reclamar de nuevo
- THEN el servidor rechaza el segundo reclamo
- AND no acredita recursos adicionales

#### Scenario: Reclamo sin completar el objetivo (sad)
- GIVEN un usuario que no ha completado el reto de hoy
- WHEN intenta reclamar
- THEN el servidor rechaza el reclamo como no elegible

#### Scenario: Reclamo de un reto pasado o expirado (sad)
- GIVEN un usuario que intenta reclamar el reto de una fecha ya cerrada
- WHEN envía el reclamo
- THEN el servidor lo rechaza por reto expirado

### Requirement: Daily Contract Reward
El reclamo del reto diario SHALL entregar un **contrato** de consejero cuyo color se deriva del
modificador del día (Caballería→rojo/OFE, Muralla→azul/DEF, Maestría→morado/MAN, Horda→blanco
comodín). El contrato se canjea luego por un consejero a elección en reclutamiento (ver
`meta-progression` §Consejero Acquisition). El cliente MUST NOT poder forzar el color.

#### Scenario: Reclamo entrega un contrato (happy)
- GIVEN un reclamo elegible para el reto de hoy
- WHEN el servidor procesa el reclamo
- THEN acredita un contrato del color correspondiente al modificador del día una sola vez
- AND el contrato queda disponible para canjear por un consejero
