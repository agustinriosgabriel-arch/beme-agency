-- ════════════════════════════════════════════════════════════════
-- Permitir a campaign_managers crear y editar campañas
-- ════════════════════════════════════════════════════════════════
-- Antes: solo admin podía INSERT/UPDATE en campanas y tablas
-- relacionadas. La UI mostraba "Nueva Campaña" / "Editar" a
-- campaign_managers pero RLS los bloqueaba con error
-- "new row violates row-level security policy for table campanas".
--
-- Ahora:
--   - Cualquier usuario interno (admin + campaign_manager) puede
--     INSERT campañas (queda dueño vía created_by).
--   - El creador (created_by) o cualquier manager asignado puede
--     UPDATE la campaña.
--   - Internal puede gestionar campana_managers / campana_handlers
--     de campañas donde sea manager o creador.
--   - Managers pueden gestionar campana_talentos de sus campañas.
--   - brand_handler y talent siguen solo con SELECT.
-- ════════════════════════════════════════════════════════════════

-- ── campanas ──────────────────────────────────────────────────
CREATE POLICY campanas_internal_insert ON campanas
  FOR INSERT
  WITH CHECK (is_internal());

CREATE POLICY campanas_creator_update ON campanas
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY campanas_manager_update ON campanas
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM campana_managers
    WHERE campana_managers.campana_id = campanas.id
      AND campana_managers.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM campana_managers
    WHERE campana_managers.campana_id = campanas.id
      AND campana_managers.user_id = auth.uid()
  ));

-- ── campana_managers ──────────────────────────────────────────
CREATE POLICY cm_internal_insert ON campana_managers
  FOR INSERT
  WITH CHECK (
    is_internal()
    AND EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_managers.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm2
               WHERE cm2.campana_id = c.id AND cm2.user_id = auth.uid()
             ))
    )
  );

CREATE POLICY cm_internal_delete ON campana_managers
  FOR DELETE
  USING (
    is_internal()
    AND EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_managers.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm2
               WHERE cm2.campana_id = c.id AND cm2.user_id = auth.uid()
             ))
    )
  );

-- ── campana_handlers ──────────────────────────────────────────
CREATE POLICY ch_internal_insert ON campana_handlers
  FOR INSERT
  WITH CHECK (
    is_internal()
    AND EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_handlers.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm
               WHERE cm.campana_id = c.id AND cm.user_id = auth.uid()
             ))
    )
  );

CREATE POLICY ch_internal_delete ON campana_handlers
  FOR DELETE
  USING (
    is_internal()
    AND EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_handlers.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm
               WHERE cm.campana_id = c.id AND cm.user_id = auth.uid()
             ))
    )
  );

-- ── campana_talentos ──────────────────────────────────────────
CREATE POLICY ct_manager_insert ON campana_talentos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_talentos.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm
               WHERE cm.campana_id = c.id AND cm.user_id = auth.uid()
             ))
    )
  );

CREATE POLICY ct_manager_update ON campana_talentos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_talentos.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm
               WHERE cm.campana_id = c.id AND cm.user_id = auth.uid()
             ))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_talentos.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm
               WHERE cm.campana_id = c.id AND cm.user_id = auth.uid()
             ))
    )
  );

CREATE POLICY ct_manager_delete ON campana_talentos
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM campanas c
      WHERE c.id = campana_talentos.campana_id
        AND (c.created_by = auth.uid()
             OR EXISTS (
               SELECT 1 FROM campana_managers cm
               WHERE cm.campana_id = c.id AND cm.user_id = auth.uid()
             ))
    )
  );
