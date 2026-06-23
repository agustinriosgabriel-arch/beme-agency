-- ════════════════════════════════════════════════════════════════
-- Permitir a cualquier interno (admin + campaign_manager) UPDATE en campanas
-- Fecha: 2026-06-23
-- ════════════════════════════════════════════════════════════════
-- PROBLEMA REPORTADO:
--   En "algunas campañas", cuando una campaign_manager (ej. Mili) sube
--   contenido o actualiza algo dentro de la campaña, el tracking de
--   "última actualización (quién/cuándo)" NO se mueve.
--
-- CAUSA:
--   bumpCampana() (campana-detalle.html) hace
--     UPDATE campanas SET updated_by = currentUser.id
--   y el trigger trg_campanas_touch bumpea updated_at.
--   Pero las únicas políticas de UPDATE sobre `campanas` eran:
--     • campanas_admin            → is_admin()
--     • campanas_creator_update   → created_by = auth.uid()
--     • campanas_manager_update   → can_manage_campana(id)  (creador o manager asignado)
--   NO existía una política de UPDATE para is_internal(). Por eso, en
--   campañas que la manager no creó y donde no está asignada como manager,
--   el UPDATE era filtrado en silencio por RLS (0 filas, sin error) →
--   updated_at/updated_by quedaban congelados, aunque sí podía editar las
--   tablas hijas (contenidos / campana_talentos tienen políticas is_internal).
--
--   Las tablas hijas ya daban escritura a is_internal() desde
--   expand_campaign_manager_2026_04_30.sql, que para `campanas` solo
--   agregó SELECT y DELETE, omitiendo UPDATE. Esta migración cierra ese hueco.
--
-- EFECTO:
--   El campaign_manager (casi-admin por diseño) ahora puede UPDATE cualquier
--   campaña → bumpCampana() funciona en TODAS las campañas, y de paso se
--   habilitan cambiar estado y archivar (soft-delete vía UPDATE deleted_at)
--   en campañas que no creó.
--
--   is_internal() es SECURITY DEFINER STABLE → no produce recursión 42P17.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS campanas_internal_update ON campanas;
CREATE POLICY campanas_internal_update ON campanas
  FOR UPDATE
  USING (is_internal())
  WITH CHECK (is_internal());
