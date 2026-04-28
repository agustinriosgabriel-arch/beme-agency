-- ════════════════════════════════════════════════════════════════
-- Fix: "infinite recursion detected in policy for relation campana_talentos"
-- ════════════════════════════════════════════════════════════════
-- Causa:
--   Las policies INSERT/UPDATE/DELETE de campana_talentos hacen
--     EXISTS (SELECT 1 FROM campanas c WHERE c.id = ... AND c.created_by = ...
--             OR EXISTS (SELECT 1 FROM campana_managers ...))
--   El SELECT a `campanas` dispara la policy `campanas_talent` que
--   a su vez hace `SELECT FROM campana_talentos JOIN user_profiles`,
--   re-evaluando las policies de campana_talentos → recursión.
--
-- Solución:
--   Mover la verificación a una función SECURITY DEFINER que bypasea
--   RLS, igual que is_admin() / is_internal().
-- ════════════════════════════════════════════════════════════════

-- Helper: ¿el usuario actual es creador o manager de la campaña?
CREATE OR REPLACE FUNCTION can_manage_campana(p_campana_id integer)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM campanas c
    WHERE c.id = p_campana_id
      AND (c.created_by = auth.uid()
           OR EXISTS (
             SELECT 1 FROM campana_managers cm
             WHERE cm.campana_id = p_campana_id
               AND cm.user_id = auth.uid()
           ))
  );
$$;

-- ── campana_talentos: reemplazar policies recursivas ──────────
DROP POLICY IF EXISTS ct_manager_insert ON campana_talentos;
DROP POLICY IF EXISTS ct_manager_update ON campana_talentos;
DROP POLICY IF EXISTS ct_manager_delete ON campana_talentos;

CREATE POLICY ct_manager_insert ON campana_talentos
  FOR INSERT
  WITH CHECK (can_manage_campana(campana_id));

CREATE POLICY ct_manager_update ON campana_talentos
  FOR UPDATE
  USING (can_manage_campana(campana_id))
  WITH CHECK (can_manage_campana(campana_id));

CREATE POLICY ct_manager_delete ON campana_talentos
  FOR DELETE
  USING (can_manage_campana(campana_id));

-- ── campana_managers / campana_handlers: misma idea ───────────
DROP POLICY IF EXISTS cm_internal_insert ON campana_managers;
DROP POLICY IF EXISTS cm_internal_delete ON campana_managers;

CREATE POLICY cm_internal_insert ON campana_managers
  FOR INSERT
  WITH CHECK (is_internal() AND can_manage_campana(campana_id));

CREATE POLICY cm_internal_delete ON campana_managers
  FOR DELETE
  USING (is_internal() AND can_manage_campana(campana_id));

DROP POLICY IF EXISTS ch_internal_insert ON campana_handlers;
DROP POLICY IF EXISTS ch_internal_delete ON campana_handlers;

CREATE POLICY ch_internal_insert ON campana_handlers
  FOR INSERT
  WITH CHECK (is_internal() AND can_manage_campana(campana_id));

CREATE POLICY ch_internal_delete ON campana_handlers
  FOR DELETE
  USING (is_internal() AND can_manage_campana(campana_id));

-- ── campanas_manager_update: misma recursión potencial ────────
DROP POLICY IF EXISTS campanas_manager_update ON campanas;
CREATE POLICY campanas_manager_update ON campanas
  FOR UPDATE
  USING (can_manage_campana(id))
  WITH CHECK (can_manage_campana(id));
