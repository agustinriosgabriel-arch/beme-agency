-- ════════════════════════════════════════════════════════════════
-- ROL "CONTADOR" — acceso exclusivo al módulo Finanzas
-- Fecha: 2026-08-11
-- ════════════════════════════════════════════════════════════════
-- Objetivo:
--   Nuevo role='contador' en user_profiles. Puede trabajar TODO el
--   módulo finanzas.html (CxC, CxP, Terceros, Clientes) pero nada más:
--   el resto de las páginas lo redirigen a finanzas.html y las policies
--   de escritura de talentos/campañas/contratos NO lo incluyen.
--
-- Qué necesita finanzas.html (relevado 2026-08-11):
--   • CRUD: facturas, pagos_marca, complementos_pago, pagos_talento,
--     factura_talentos, facturas_auditoria, terceros, comisiones_terceros,
--     pagos_tercero, clientes
--   • SELECT: campanas, campana_talentos, marcas, talentos (joins),
--     talento_cuentas_pago (datos de pago del talento), user_profiles (ya
--     es visible a cualquier auth)
--   • UPDATE puntual: campanas.estado (finalizar), campana_talentos
--     (pago_estado, pago_fecha, fecha_pago_estimada, invoice_url)
--   • Storage: bucket `finanzas` (policy finanzas_auth_all ya cubre a
--     cualquier sesión autenticada)
--
-- NOTA RLS: los joins de Supabase fallan en silencio sin policy en la
-- tabla relacionada — por eso marcas/talentos llevan SELECT explícito.
-- ════════════════════════════════════════════════════════════════

-- ── 1. Helper (SECURITY DEFINER, igual que is_admin/is_internal) ──
CREATE OR REPLACE FUNCTION is_contador() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'contador');
$$;

-- ── 2. Tablas propias de Finanzas: CRUD completo ──────────────────
DROP POLICY IF EXISTS facturas_contador ON facturas;
CREATE POLICY facturas_contador ON facturas
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS pagos_marca_contador ON pagos_marca;
CREATE POLICY pagos_marca_contador ON pagos_marca
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS complementos_contador ON complementos_pago;
CREATE POLICY complementos_contador ON complementos_pago
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS pagos_talento_contador ON pagos_talento;
CREATE POLICY pagos_talento_contador ON pagos_talento
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS factura_talentos_contador ON factura_talentos;
CREATE POLICY factura_talentos_contador ON factura_talentos
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS fa_contador ON facturas_auditoria;
CREATE POLICY fa_contador ON facturas_auditoria
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS terceros_contador ON terceros;
CREATE POLICY terceros_contador ON terceros
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS comisiones_contador ON comisiones_terceros;
CREATE POLICY comisiones_contador ON comisiones_terceros
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS pagos_tercero_contador ON pagos_tercero;
CREATE POLICY pagos_tercero_contador ON pagos_tercero
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS clientes_contador ON clientes;
CREATE POLICY clientes_contador ON clientes
  FOR ALL USING (is_contador()) WITH CHECK (is_contador());

-- ── 3. Tablas compartidas: lectura + updates puntuales ────────────
DROP POLICY IF EXISTS campanas_contador_select ON campanas;
CREATE POLICY campanas_contador_select ON campanas
  FOR SELECT USING (is_contador());

-- finalizarCampana() en finanzas.html marca estado='finalizada'
DROP POLICY IF EXISTS campanas_contador_update ON campanas;
CREATE POLICY campanas_contador_update ON campanas
  FOR UPDATE USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS ct_contador_select ON campana_talentos;
CREATE POLICY ct_contador_select ON campana_talentos
  FOR SELECT USING (is_contador());

-- pago_estado / pago_fecha / fecha_pago_estimada / invoice_url
DROP POLICY IF EXISTS ct_contador_update ON campana_talentos;
CREATE POLICY ct_contador_update ON campana_talentos
  FOR UPDATE USING (is_contador()) WITH CHECK (is_contador());

DROP POLICY IF EXISTS marcas_contador_select ON marcas;
CREATE POLICY marcas_contador_select ON marcas
  FOR SELECT USING (is_contador());

DROP POLICY IF EXISTS talentos_contador_select ON talentos;
CREATE POLICY talentos_contador_select ON talentos
  FOR SELECT USING (is_contador());

DROP POLICY IF EXISTS tcp_contador_select ON talento_cuentas_pago;
CREATE POLICY tcp_contador_select ON talento_cuentas_pago
  FOR SELECT USING (is_contador());

-- ── 4. Solo el Admin general crea/gestiona contadores ─────────────
-- Extiende enforce_admin_role_grant (restrict_admin_user_mgmt_2026_06_19):
-- si un campaign_manager pudiera crear un 'contador', vería Finanzas a
-- través de esa cuenta. Ambos roles quedan reservados al admin.
CREATE OR REPLACE FUNCTION enforce_admin_role_grant() RETURNS trigger AS $$
BEGIN
  -- Crear o asignar roles privilegiados requiere ser admin general
  IF NEW.role IN ('admin','contador') AND NOT is_admin() THEN
    RAISE EXCEPTION 'Solo el Administrador general puede asignar el rol %', NEW.role;
  END IF;
  -- Modificar un perfil que YA es admin/contador requiere ser admin general
  IF TG_OP = 'UPDATE' AND OLD.role IN ('admin','contador') AND NOT is_admin() THEN
    RAISE EXCEPTION 'Solo el Administrador general puede modificar este perfil';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- (el trigger trg_enforce_admin_role_grant ya existe y apunta a esta función)

-- El manager tampoco puede borrar contadores (antes: solo protegía admins)
DROP POLICY IF EXISTS user_profiles_delete ON user_profiles;
CREATE POLICY user_profiles_delete ON user_profiles
  FOR DELETE USING (
    is_admin() OR (is_internal() AND role NOT IN ('admin','contador'))
  );

-- ── Verificación rápida ───────────────────────────────────────────
-- SELECT polname, polrelid::regclass FROM pg_policy WHERE polname ILIKE '%contador%';
