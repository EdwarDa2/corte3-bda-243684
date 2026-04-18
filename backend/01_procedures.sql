-- ==============================================================================
-- 1 STORED PROCEDURE: sp_agendar_cita
-- ==============================================================================
CREATE OR REPLACE PROCEDURE sp_agendar_cita(
    p_mascota_id INT,
    p_veterinario_id INT,
    p_fecha_hora TIMESTAMP,
    p_motivo TEXT,
    OUT p_cita_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_mascota_existe BOOLEAN;
    v_vet_activo BOOLEAN;
    v_dias_descanso TEXT;
    v_dia_cita TEXT;
    v_num_dia INT;
    v_cita_existente INT;
BEGIN
    --1 Validar que la mascota existe
    SELECT EXISTS(SELECT 1 FROM mascotas WHERE id = p_mascota_id) INTO v_mascota_existe;
    IF NOT v_mascota_existe THEN
        RAISE EXCEPTION 'La mascota con ID % no existe.', p_mascota_id;
    END IF;

    -- 2 Validar que el veterinario existe y está activo (Manejando el caso NULL)
    SELECT activo, dias_descanso INTO v_vet_activo, v_dias_descanso
    FROM veterinarios
    WHERE id = p_veterinario_id;

    IF v_vet_activo IS NULL THEN
        RAISE EXCEPTION 'El veterinario con ID % no existe.', p_veterinario_id;
    ELSIF NOT v_vet_activo THEN
        RAISE EXCEPTION 'El veterinario con ID % no está activo.', p_veterinario_id;
    END IF;

    -- 3 Validar el día de descanso del veterinario
    -- Usamos ISODOW (1=lunes, 7=domingo) para evitar problemas de idioma (locales) en Docker
    v_num_dia := EXTRACT(ISODOW FROM p_fecha_hora);
    v_dia_cita := CASE v_num_dia
        WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes' WHEN 3 THEN 'miércoles'
        WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes' WHEN 6 THEN 'sábado' WHEN 7 THEN 'domingo'
    END;

    IF position(v_dia_cita in v_dias_descanso) > 0 THEN
        RAISE EXCEPTION 'El veterinario descansa en este día (%)', v_dia_cita;
    END IF;

    -- 4 Prevenir colisiones de horario (Read-decide-write con bloqueo)
    -- Bloqueamos el registro del veterinario para evitar que dos secretarias 
    -- agenden al mismo tiempo en el mismo milisegundo.
    PERFORM 1 FROM veterinarios WHERE id = p_veterinario_id FOR UPDATE;

    SELECT id INTO v_cita_existente FROM citas
    WHERE veterinario_id = p_veterinario_id 
      AND fecha_hora = p_fecha_hora 
      AND estado != 'CANCELADA';

    IF v_cita_existente IS NOT NULL THEN
        RAISE EXCEPTION 'Colisión de horario: El veterinario ya tiene una cita en ese momento.';
    END IF;

    -- 5 Insertar la cita y devolver el ID generado
    INSERT INTO citas (mascota_id, veterinario_id, fecha_hora, motivo, estado)
    VALUES (p_mascota_id, p_veterinario_id, p_fecha_hora, p_motivo, 'AGENDADA')
    RETURNING id INTO p_cita_id;

EXCEPTION
    WHEN OTHERS THEN
        -- Propagamos la excepción al llamador sin terminar la transacción con ROLLBACK explícito
        RAISE;
END;
$$;

-- ==============================================================================
-- 2 FUNCTION: fn_total_facturado
-- ==============================================================================
CREATE OR REPLACE FUNCTION fn_total_facturado(
    p_mascota_id INT,
    p_anio INT
) RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_citas NUMERIC;
    v_total_vacunas NUMERIC;
BEGIN
    -- Usamos COALESCE para el caso crítico: si no hay citas, devuelve 0 en lugar de NULL
    SELECT COALESCE(SUM(costo), 0) INTO v_total_citas
    FROM citas
    WHERE mascota_id = p_mascota_id
      AND estado = 'COMPLETADA'
      AND EXTRACT(YEAR FROM fecha_hora) = p_anio;

    -- Aplicamos la misma lógica para las vacunas
    SELECT COALESCE(SUM(costo_cobrado), 0) INTO v_total_vacunas
    FROM vacunas_aplicadas
    WHERE mascota_id = p_mascota_id
      AND EXTRACT(YEAR FROM fecha_aplicacion) = p_anio;

    RETURN v_total_citas + v_total_vacunas;
END;
$$;