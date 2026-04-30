-- ════════════════════════════════════════════════════════════════
-- Expandir permisos de campaign_manager a casi-admin
-- Fecha: 2026-04-30
-- ════════════════════════════════════════════════════════════════
-- El "Admin de Campaña" (campaign_manager) ahora tiene los mismos
-- permisos que el Administrador (admin), EXCEPTO:
--   1. NO puede eliminar usuarios (DELETE en user_profiles)
--   2. NO puede acceder a Finanzas (facturas, pagos, complementos)
--   3. NO puede ver precios en campañas (gating por UI)
--
-- Cambios concretos:
--   • clientes / marcas: ahora is_internal() puede crear/editar/borrar
--   • campanas: is_internal() puede SELECT todas (con toggle UI
--     "Mis campañas / Todas"); también puede DELETE
--   • campana_talentos / contenidos: SELECT/UPDATE para is_internal()
--   • user_profiles: campaign_manager puede INSERT/UPDATE; DELETE
--     queda restringido a admin
--   • Finanzas (facturas, pagos_marca, pagos_talento, complementos_pago):
--     restringidas a is_admin() (antes cualquier auth podía acceder)
-- ════════════════════════════════════════════════════════════════

-- ── clientes ─────────────────────────────────────────────────
DROP POLICY IF EXISTS clientes_all ON clientes;
CREATE POLICY clientes_internal_all ON clientes
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- ── marcas ───────────────────────────────────────────────────
DROP POLICY IF EXISTS marcas_all ON marcas;
CREATE POLICY marcas_internal_all ON marcas
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- ── campanas ─────────────────────────────────────────────────
-- SELECT para todos los internal (manager ve todas; UI filtra "mis campañas")
CREATE POLICY campanas_internal_select ON campanas
  FOR SELECT USING (is_internal());

-- DELETE para internal (soft delete usa UPDATE; este cubre hard delete)
CREATE POLICY campanas_internal_delete ON campanas
  FOR DELETE USING (is_internal());

-- ── campana_talentos: SELECT/UPDATE/DELETE para todos los internal ──
CREATE POLICY ct_internal_select ON campana_talentos
  FOR SELECT USING (is_internal());

CREATE POLICY ct_internal_update ON campana_talentos
  FOR UPDATE USING (is_internal()) WITH CHECK (is_internal());

CREATE POLICY ct_internal_delete ON campana_talentos
  FOR DELETE USING (is_internal());

CREATE POLICY ct_internal_insert ON campana_talentos
  FOR INSERT WITH CHECK (is_internal());

-- ── contenidos: ALL para internal ───────────────────────────
CREATE POLICY cont_internal ON contenidos
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- ── contenido_observaciones: ALL para internal ──────────────
CREATE POLICY obs_internal ON contenido_observaciones
  FOR ALL USING (is_internal()) WITH CHECK (is_internal());

-- ── user_profiles: campaign_manager puede crear/editar; DELETE solo admin
DROP POLICY IF EXISTS user_profiles_update ON user_profiles;
CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE USING (is_internal() OR id = auth.uid());

DROP POLICY IF EXISTS user_profiles_insert ON user_profiles;
CREATE POLICY user_profiles_insert ON user_profiles
  FOR INSERT WITH CHECK (is_internal() OR id = auth.uid());

CREATE POLICY user_profiles_delete ON user_profiles
  FOR DELETE USING (is_admin());

-- ── Finanzas: restringir a admin only ───────────────────────
DROP POLICY IF EXISTS facturas_auth ON facturas;
CREATE POLICY facturas_admin ON facturas
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS pagos_marca_auth ON pagos_marca;
CREATE POLICY pagos_marca_admin ON pagos_marca
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS complementos_auth ON complementos_pago;
CREATE POLICY complementos_admin ON complementos_pago
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS pagos_talento_auth ON pagos_talento;
CREATE POLICY pagos_talento_admin ON pagos_talento
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());
