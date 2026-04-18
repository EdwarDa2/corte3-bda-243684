-- ==============================================================================
-- 5 ROW-LEVEL SECURITY (RLS)
-- ==============================================================================

-- 5.1 Habilitar RLS en las tablas sensibles
ALTER TABLE mascotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacunas_aplicadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas ENABLE ROW LEVEL SECURITY;

-- 5.2 Limpiar políticas previas 
DROP POLICY IF EXISTS rls_admin_mascotas ON mascotas;
DROP POLICY IF EXISTS rls_recepcion_mascotas ON mascotas;
DROP POLICY IF EXISTS rls_vet_mascotas ON mascotas;

DROP POLICY IF EXISTS rls_admin_vacunas ON vacunas_aplicadas;
DROP POLICY IF EXISTS rls_vet_vacunas ON vacunas_aplicadas;

DROP POLICY IF EXISTS rls_admin_citas ON citas;
DROP POLICY IF EXISTS rls_recepcion_citas ON citas;
DROP POLICY IF EXISTS rls_vet_citas ON citas;

-- ==============================================================================
-- 5.3 POLÍTICAS PARA: mascotas
-- ==============================================================================
-- Administrador y Recepción ven todas las mascotas
CREATE POLICY rls_admin_mascotas ON mascotas FOR ALL TO rol_administrador USING (true);
CREATE POLICY rls_recepcion_mascotas ON mascotas FOR ALL TO rol_recepcion USING (true);

-- Veterinarios solo ven las mascotas que atienden (cruce con vet_atiende_mascota)
CREATE POLICY rls_vet_mascotas ON mascotas FOR ALL TO rol_veterinario
USING (
    EXISTS (
        SELECT 1 
        FROM vet_atiende_mascota vam 
        WHERE vam.mascota_id = mascotas.id 
          AND vam.vet_id = current_setting('app.current_vet_id', true)::int
    )
);

-- ==============================================================================
-- 5.4 POLÍTICAS PARA: vacunas_aplicadas
-- ==============================================================================
-- Administrador ve todas las vacunas
CREATE POLICY rls_admin_vacunas ON vacunas_aplicadas FOR ALL TO rol_administrador USING (true);

CREATE POLICY rls_vet_vacunas ON vacunas_aplicadas FOR ALL TO rol_veterinario
USING (
    EXISTS (
        SELECT 1 
        FROM vet_atiende_mascota vam 
        WHERE vam.mascota_id = vacunas_aplicadas.mascota_id 
          AND vam.vet_id = current_setting('app.current_vet_id', true)::int
    )
);

-- ==============================================================================
-- 5.5 POLÍTICAS PARA: citas
-- ==============================================================================
-- Administrador y Recepción ven todas las citas
CREATE POLICY rls_admin_citas ON citas FOR ALL TO rol_administrador USING (true);
CREATE POLICY rls_recepcion_citas ON citas FOR ALL TO rol_recepcion USING (true);

CREATE POLICY rls_vet_citas ON citas FOR ALL TO rol_veterinario
USING (
    veterinario_id = current_setting('app.current_vet_id', true)::int
);