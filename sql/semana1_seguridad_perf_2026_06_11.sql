-- ══════════════════════════════════════════════════════════════════
-- SEMANA 1 — Seguridad + Performance (2026-06-11)
-- Ejecutar UNA VEZ en Supabase SQL Editor.
--
-- Contenido:
--   A. RLS: cerrar policies demasiado permisivas (authenticated → internal)
--   B. Índices para los hijos de contenidos (campana-detalle carga 6 tablas por contenido_id)
--   C. Contratos: columna spark_code + numeración única
--
-- NO toca: finanzas (ya quedó admin-only en expand_campaign_manager_2026_04_30),
-- contenido_scripts/borradores/estadisticas (el portal de talentos los necesita —
-- se granularizan en Fase 2), ni las policies anon de rosters (links públicos).
-- ══════════════════════════════════════════════════════════════════

-- ┌──────────────────────────────────────────────────────────────┐
-- │ A. RLS HARDENING                                             │
-- └──────────────────────────────────────────────────────────────┘

-- A1. user_profiles: los talentos solo ven su propio perfil.
--     (Antes: cualquier autenticado veía emails/roles de TODOS los usuarios.)
--     Admin/manager/handler siguen viendo todos (la UI muestra nombres de equipo).
DROP POLICY IF EXISTS user_profiles_select ON user_profiles;
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT
  USING (id = auth.uid() OR (auth.uid() IS NOT NULL AND get_user_role() <> 'talent'));

-- A2. talentos: lectura para cualquier autenticado (handlers ven talentos de sus
--     campañas vía join), pero escritura SOLO interna (antes un talento logueado
--     podía editar/borrar toda la base de talentos).
DROP POLICY IF EXISTS talentos_auth_all ON talentos;
CREATE POLICY talentos_auth_read ON talentos FOR SELECT TO authenticated USING (true);
CREATE POLICY talentos_internal_insert ON talentos FOR INSERT TO authenticated WITH CHECK (is_internal());
CREATE POLICY talentos_internal_update ON talentos FOR UPDATE TO authenticated USING (is_internal());
CREATE POLICY talentos_internal_delete ON talentos FOR DELETE TO authenticated USING (is_internal());

-- A3. rosters: escritura solo interna (las policies anon de links públicos quedan igual).
DROP POLICY IF EXISTS rosters_auth_all ON rosters;
CREATE POLICY rosters_auth_read ON rosters FOR SELECT TO authenticated USING (true);
CREATE POLICY rosters_internal_write ON rosters FOR INSERT TO authenticated WITH CHECK (is_internal());
CREATE POLICY rosters_internal_update ON rosters FOR UPDATE TO authenticated USING (is_internal());
CREATE POLICY rosters_internal_delete ON rosters FOR DELETE TO authenticated USING (is_internal());

DROP POLICY IF EXISTS rs_auth_all ON roster_selecciones;
CREATE POLICY rs_internal_all ON roster_selecciones FOR ALL TO authenticated
  USING (is_internal()) WITH CHECK (is_internal());

-- A4. contratos: solo equipo interno (handlers y talentos no usan contratos.html).
DROP POLICY IF EXISTS contratos_auth ON contratos;
DROP POLICY IF EXISTS "auth_all_contratos" ON contratos;
CREATE POLICY contratos_internal ON contratos FOR ALL
  USING (is_internal()) WITH CHECK (is_internal());

-- A5. prospecciones: herramienta interna de ventas — ningún talento/handler
--     tiene por qué ver pipeline, contactos ni secuencias de email.
DROP POLICY IF EXISTS prospecciones_auth ON prospecciones;
CREATE POLICY prospecciones_internal ON prospecciones FOR ALL
  USING (is_internal()) WITH CHECK (is_internal());

DROP POLICY IF EXISTS prospeccion_contactos_auth ON prospeccion_contactos;
CREATE POLICY prospeccion_contactos_internal ON prospeccion_contactos FOR ALL
  USING (is_internal()) WITH CHECK (is_internal());

DROP POLICY IF EXISTS prospeccion_templates_auth ON prospeccion_email_templates;
CREATE POLICY prospeccion_templates_internal ON prospeccion_email_templates FOR ALL
  USING (is_internal()) WITH CHECK (is_internal());

DROP POLICY IF EXISTS prospeccion_email_log_auth ON prospeccion_email_log;
CREATE POLICY prospeccion_email_log_internal ON prospeccion_email_log FOR ALL
  USING (is_internal()) WITH CHECK (is_internal());

DROP POLICY IF EXISTS prosp_seq_auth ON prospeccion_email_secuencias;
CREATE POLICY prosp_seq_internal ON prospeccion_email_secuencias FOR ALL
  USING (is_internal()) WITH CHECK (is_internal());

DROP POLICY IF EXISTS prosp_cola_auth ON prospeccion_email_cola;
CREATE POLICY prosp_cola_internal ON prospeccion_email_cola FOR ALL
  USING (is_internal()) WITH CHECK (is_internal());
-- Nota: process-email-queue.js usa la service key → no lo afecta RLS.

-- ┌──────────────────────────────────────────────────────────────┐
-- │ B. ÍNDICES DE PERFORMANCE                                    │
-- └──────────────────────────────────────────────────────────────┘
-- campana-detalle.html → loadCampanaChildren() consulta estas 6 tablas
-- con .in('contenido_id', [...]) en cada carga.

CREATE INDEX IF NOT EXISTS idx_contenido_observaciones_contenido
  ON contenido_observaciones(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_scripts_contenido
  ON contenido_scripts(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_borradores_contenido
  ON contenido_borradores(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_historial_contenido
  ON contenido_historial(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_briefs_contenido
  ON contenido_briefs(contenido_id);
CREATE INDEX IF NOT EXISTS idx_contenido_estadisticas_contenido_created
  ON contenido_estadisticas(contenido_id, created_at DESC);

-- Soporte del "gate" de auto-refresh (ORDER BY updated_at DESC LIMIT 1):
CREATE INDEX IF NOT EXISTS idx_campanas_updated_at
  ON campanas(updated_at DESC NULLS LAST);

-- ┌──────────────────────────────────────────────────────────────┐
-- │ C. CONTRATOS                                                 │
-- └──────────────────────────────────────────────────────────────┘

-- C1. spark_code: el formulario lo envía pero la tabla original no lo tenía.
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS spark_code boolean DEFAULT false;

-- C2. Numeración única: el trigger generate_contract_number() puede generar
--     duplicados en inserts concurrentes. Creamos el índice único solo si no
--     hay duplicados preexistentes (si los hay, lo reporta para limpiar a mano).
DO $$
DECLARE dup_count integer;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT numero_contrato FROM contratos
    WHERE numero_contrato IS NOT NULL AND numero_contrato <> ''
    GROUP BY numero_contrato HAVING COUNT(*) > 1
  ) d;
  IF dup_count = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_contratos_numero
      ON contratos(numero_contrato)
      WHERE numero_contrato IS NOT NULL AND numero_contrato <> '';
    RAISE NOTICE 'uniq_contratos_numero creado OK';
  ELSE
    RAISE WARNING 'Hay % numeros de contrato duplicados — limpiar antes de crear el indice unico. Ver: SELECT numero_contrato, COUNT(*) FROM contratos GROUP BY 1 HAVING COUNT(*) > 1;', dup_count;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- VERIFICACIÓN RÁPIDA POST-MIGRACIÓN
-- ══════════════════════════════════════════════════════════════════
-- 1. Como talento (portal): debe seguir viendo sus contenidos y subir borradores.
-- 2. Como brand_handler: debe seguir viendo talentos y nombres de equipo en campañas.
-- 3. Como manager: contratos y prospecciones funcionan normal.
-- SELECT polname, polcmd FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
--   WHERE c.relname IN ('talentos','contratos','prospecciones','user_profiles');
