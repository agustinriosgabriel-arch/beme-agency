-- ════════════════════════════════════════════════════════════════
-- "Admin de Campaña" (campaign_manager): gestión de usuarios SIN admins
-- Fecha: 2026-06-19
-- ════════════════════════════════════════════════════════════════
-- Objetivo:
--   El Admin de Campaña tiene los mismos permisos que el Admin general
--   EXCEPTO la sección Finanzas (ya restringida a is_admin()) y la gestión
--   de administradores.
--
--   Antes (expand_campaign_manager_2026_04_30.sql):
--     • user_profiles INSERT/UPDATE: is_internal() OR id = auth.uid()
--       → HUECO: un campaign_manager podía crear o promover usuarios a
--         role='admin', e incluso auto-promoverse vía id = auth.uid().
--     • user_profiles DELETE: is_admin() → el manager no podía borrar
--       ningún usuario, ni siquiera los no-admin.
--
--   Ahora:
--     • DELETE: is_admin() OR (is_internal() AND role <> 'admin')
--       → el manager borra usuarios NO-admin; los admin solo el admin general.
--     • INSERT/UPDATE: se conserva la política permisiva, pero un TRIGGER
--       bloquea que cualquiera que no sea is_admin() cree, promueva, mantenga
--       o modifique perfiles con role='admin' (cubre también la auto-promoción).
-- ════════════════════════════════════════════════════════════════

-- ── DELETE: manager puede eliminar usuarios no-admin ──────────────
DROP POLICY IF EXISTS user_profiles_delete ON user_profiles;
CREATE POLICY user_profiles_delete ON user_profiles
  FOR DELETE USING (
    is_admin() OR (is_internal() AND role <> 'admin')
  );

-- ── Trigger: solo el Admin general puede tocar el rol 'admin' ──────
-- Se ejecuta en INSERT y UPDATE. is_admin() refleja al usuario que llama
-- (auth.uid() viene del JWT aunque la función sea SECURITY DEFINER).
CREATE OR REPLACE FUNCTION enforce_admin_role_grant() RETURNS trigger AS $$
BEGIN
  -- Crear o asignar un perfil con role='admin' requiere ser admin general
  IF NEW.role = 'admin' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Solo el Administrador general puede crear o asignar el rol admin';
  END IF;
  -- Modificar un perfil que YA es admin requiere ser admin general
  IF TG_OP = 'UPDATE' AND OLD.role = 'admin' AND NOT is_admin() THEN
    RAISE EXCEPTION 'Solo el Administrador general puede modificar administradores';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_admin_role_grant ON user_profiles;
CREATE TRIGGER trg_enforce_admin_role_grant
  BEFORE INSERT OR UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_admin_role_grant();
