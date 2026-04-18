-- ==============================================================================
-- 4 ROLES Y PERMISOS (GRANT / REVOKE)
-- ==============================================================================

-- 4.1 Crear Roles de Grupo (Las "Plantillas" de permisos)
CREATE ROLE rol_administrador;
CREATE ROLE rol_recepcion;
CREATE ROLE rol_veterinario;

-- 4.2 Permisos: Administrador
-- "Ve todo. Puede crear usuarios, asignar mascotas a veterinarios, y gestionar inventario"
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO rol_administrador;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO rol_administrador;
GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO rol_administrador;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO rol_administrador;

-- 4.3 Permisos: Recepción
-- "Ve todas las mascotas y sus dueños... agendar citas... NO puede ver vacunas"
GRANT SELECT ON duenos, mascotas, veterinarios TO rol_recepcion;
GRANT SELECT, INSERT, UPDATE ON citas TO rol_recepcion;
GRANT USAGE, SELECT ON SEQUENCE citas_id_seq TO rol_recepcion;
-- Permiso explícito para usar el procedure de agendar
GRANT EXECUTE ON PROCEDURE sp_agendar_cita(INT, INT, TIMESTAMP, TEXT, OUT INT) TO rol_recepcion;
-- Nota: Intencionalmente NO se da GRANT sobre vacunas_aplicadas ni inventario_vacunas.

-- 4.4 Permisos: Veterinario
-- "Registrar nuevas citas y aplicar vacunas a sus mascotas"
GRANT SELECT ON duenos, mascotas, veterinarios, vet_atiende_mascota TO rol_veterinario;
GRANT SELECT, INSERT, UPDATE ON citas TO rol_veterinario;
GRANT USAGE, SELECT ON SEQUENCE citas_id_seq TO rol_veterinario;
GRANT SELECT, INSERT ON vacunas_aplicadas TO rol_veterinario;
GRANT USAGE, SELECT ON SEQUENCE vacunas_aplicadas_id_seq TO rol_veterinario;
GRANT SELECT ON inventario_vacunas TO rol_veterinario;
-- Permiso explícito para usar el procedure de agendar
GRANT EXECUTE ON PROCEDURE sp_agendar_cita(INT, INT, TIMESTAMP, TEXT, OUT INT) TO rol_veterinario;

-- 4.5 Crear Usuarios de prueba (Para demostrar el sistema en tu cuaderno y en la app)
-- Estos usuarios son los que usaremos desde el frontend/backend de Node.js
CREATE USER usr_admin WITH PASSWORD 'admin123';
GRANT rol_administrador TO usr_admin;

CREATE USER usr_recepcion WITH PASSWORD 'recep123';
GRANT rol_recepcion TO usr_recepcion;

-- usr_vet1 representará al Dr. López (vet_id = 1)
CREATE USER usr_vet1 WITH PASSWORD 'vet123'; 
GRANT rol_veterinario TO usr_vet1;

-- usr_vet2 representará a la Dra. García (vet_id = 2)
CREATE USER usr_vet2 WITH PASSWORD 'vet123'; 
GRANT rol_veterinario TO usr_vet2;