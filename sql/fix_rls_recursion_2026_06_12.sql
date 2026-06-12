-- ══════════════════════════════════════════════════════════════════
-- FIX — Admin no ve talentos tras Semana 1 ("Reconectando…")  (2026-06-12)
-- Ejecutar en Supabase SQL Editor (proyecto ngstqwbzvnpggpklifat).
-- Idempotente: se puede re-ejecutar sin romper.
--
-- CAUSA:
--   La policy nueva user_profiles_select llama get_user_role()/is_internal().
--   Esas funciones leen user_profiles. Si NO son SECURITY DEFINER, leer
--   user_profiles vuelve a disparar la policy → recursión infinita (42P17).
--   Solo afecta a usuarios autenticados (anon corta por auth.uid() NULL),
--   por eso el roster público (anon) anda pero el admin recibe error y
--   el dashboard queda en "Reconectando…".
--
-- FIX:
--   Forzar SECURITY DEFINER en las funciones helper de RLS. Bypassan RLS,
--   cortan la recursión. No cambia su lógica, solo el flag de seguridad
--   (requisito estándar de Supabase para funciones usadas dentro de policies).
-- ══════════════════════════════════════════════════════════════════

-- A. Todas las funciones helper que usan las policies → SECURITY DEFINER
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_internal', 'is_admin', 'get_user_role',
        'is_staff', 'get_role', 'current_user_role', 'is_talent'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER', r.sig);
    RAISE NOTICE 'SECURITY DEFINER aplicado → %', r.sig;
  END LOOP;
END $$;

-- B. (defensivo) user_profiles_select sin recursión:
--    el usuario ve su propia fila; el equipo interno ve todas vía is_internal()
--    (ahora SECURITY DEFINER, no recursiona).
DROP POLICY IF EXISTS user_profiles_select ON user_profiles;
CREATE POLICY user_profiles_select ON user_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (auth.uid() IS NOT NULL AND get_user_role() <> 'talent')
  );

-- ──────────────────────────────────────────────────────────────────
-- DIAGNÓSTICO (devuelve resultados — pegámelos para corregir el cap de 432)
-- ──────────────────────────────────────────────────────────────────

-- 1) Las funciones helper deben quedar prosecdef = true
SELECT proname AS funcion, prosecdef AS es_security_definer
FROM pg_proc
WHERE proname IN ('is_internal','is_admin','get_user_role','is_talent','is_staff');

-- 2) Policies actuales sobre talentos: ESTO explica por qué el anon ve solo 432
SELECT
  polname                                   AS policy,
  CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
              WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
              WHEN '*' THEN 'ALL' END        AS comando,
  ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(polroles)) AS roles,
  pg_get_expr(polqual, polrelid)            AS using_expr
FROM pg_policy
WHERE polrelid = 'talentos'::regclass
ORDER BY polname;

-- 3) Cuántos talentos hay en total (esta query sí ve todo, corre como owner en el editor)
SELECT count(*) AS total_talentos_reales FROM talentos;
