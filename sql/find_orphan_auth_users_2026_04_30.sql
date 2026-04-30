-- ════════════════════════════════════════════════════════════════
-- Helper: detectar usuarios de auth sin perfil en user_profiles
-- Fecha: 2026-04-30
-- ════════════════════════════════════════════════════════════════
-- Antes del fix de saveUsuario(), si signUp() limpiaba la sesión y la RLS
-- rechazaba el insert en user_profiles, quedaba un auth.user huérfano.
-- Estos usuarios pueden loguearse pero no tienen perfil → no aparecen en
-- la gestión de usuarios y la app no los reconoce.
--
-- Este script:
--   1) Lista los huérfanos (para que veas qué quedó suelto).
--   2) Opcional: te da el comando para crear el perfil manualmente.
--   3) Opcional: te da el comando para borrarlos del auth.
--
-- Correlo en el SQL editor de Supabase con tu rol de admin.

-- ─────────────────────────────────────────────────────────────────
-- 1) Listar auth.users sin perfil
-- ─────────────────────────────────────────────────────────────────
SELECT
  au.id,
  au.email,
  au.created_at,
  au.last_sign_in_at,
  au.email_confirmed_at IS NOT NULL AS email_confirmado
FROM auth.users au
LEFT JOIN public.user_profiles up ON up.id = au.id
WHERE up.id IS NULL
ORDER BY au.created_at DESC;

-- ─────────────────────────────────────────────────────────────────
-- 2) Crear perfil para un huérfano específico (rellená el id y los datos)
-- ─────────────────────────────────────────────────────────────────
-- INSERT INTO public.user_profiles (id, nombre, email, role, activo)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',  -- pegá el id del auth.user
--   'Nombre Apellido',
--   'email@dominio.com',
--   'campaign_manager',                      -- admin | campaign_manager | brand_handler | talent
--   true
-- );

-- ─────────────────────────────────────────────────────────────────
-- 3) Borrar todos los auth.users huérfanos (¡destructivo!)
-- ─────────────────────────────────────────────────────────────────
-- Descomentar para ejecutar. Va a eliminar la cuenta de login de los
-- usuarios listados en (1). Después ya no podrán loguearse.
--
-- DELETE FROM auth.users
-- WHERE id IN (
--   SELECT au.id FROM auth.users au
--   LEFT JOIN public.user_profiles up ON up.id = au.id
--   WHERE up.id IS NULL
-- );
