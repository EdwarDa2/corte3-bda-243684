-- ==============================================================================
-- 2 TRIGGER: trg_historial_cita
-- ==============================================================================

CREATE OR REPLACE FUNCTION fn_trg_historial_cita()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_mascota_nombre VARCHAR;
    v_vet_nombre VARCHAR;
    v_fecha_formateada VARCHAR;
BEGIN
    -- Obtenemos el nombre de la mascota usando el ID recién insertado (NEW)
    SELECT nombre INTO v_mascota_nombre
    FROM mascotas
    WHERE id = NEW.mascota_id;

    -- Obtenemos el nombre del veterinario usando el ID recién insertado (NEW)
    SELECT nombre INTO v_vet_nombre
    FROM veterinarios
    WHERE id = NEW.veterinario_id;

    -- Formateamos la fecha para que coincida con el ejemplo (ej: 15/04/2026)
    v_fecha_formateada := TO_CHAR(NEW.fecha_hora, 'DD/MM/YYYY');

    -- Registramos el evento en el log auditable
    INSERT INTO historial_movimientos (tipo, referencia_id, descripcion)
    VALUES (
        'CITA_AGENDADA',
        NEW.id,
        'Cita para ' || v_mascota_nombre || ' con ' || v_vet_nombre || ' el ' || v_fecha_formateada
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_historial_cita ON citas;

CREATE TRIGGER trg_historial_cita
AFTER INSERT ON citas
FOR EACH ROW
EXECUTE FUNCTION fn_trg_historial_cita();