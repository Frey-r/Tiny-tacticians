## ADDED Requirements

### Requirement: Moderator First Run Config
El servidor SHALL permitir forzar el flujo de primera run (tutorial/intro) para los moderadores si la opción `enableFirstRunEvent` está activa en la configuración de la instalación. Al cargar el perfil del usuario, si este es moderador y la opción está activa, el servidor SHALL omitir el campo `onboardedAt` en el perfil devuelto al cliente.

#### Scenario: Moderador con la opción activa
- **GIVEN** que la opción de configuración `enableFirstRunEvent` está activa en la instalación
- **WHEN** un usuario moderador solicita su perfil de usuario
- **THEN** el perfil devuelto al cliente omitirá el campo `onboardedAt`

#### Scenario: Moderador con la opción inactiva
- **GIVEN** que la opción de configuración `enableFirstRunEvent` está inactiva en la instalación
- **WHEN** un usuario moderador solicita su perfil de usuario
- **THEN** el perfil devuelto al cliente incluirá su `onboardedAt` correspondiente

#### Scenario: Jugador no moderador con la opción activa
- **GIVEN** que la opción de configuración `enableFirstRunEvent` está activa en la instalación
- **WHEN** un usuario no moderador solicita su perfil de usuario
- **THEN** el perfil devuelto al cliente incluirá su `onboardedAt` correspondiente
