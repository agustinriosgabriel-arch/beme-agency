-- ════════════════════════════════════════════════════════════════════════════
--  FIX — el estado "Pausada" no se guardaba: al refrescar la campaña volvía a
--  "En curso".
--
--  Causa: la base RECHAZABA el valor 'pausada' por un CHECK constraint heredado
--  que sólo permitía  sin_iniciar / en_curso / etapa_finanzas / finalizada /
--  cancelada  (ver el comentario viejo en schema_unificado.sql, línea 178).
--  El frontend no chequeaba el error del UPDATE, así que mostraba
--  "Estado actualizado ✓" aunque la base no guardaba nada → al refrescar
--  reaparecía el estado anterior (en_curso).
--
--  Esto afecta tanto a campanas.estado como a campana_talentos.estado
--  (la sub-campaña por talento también puede ponerse en Pausada).
--
--  Cómo correrlo:  Supabase → SQL Editor → pegar y "Run". Es idempotente.
--  Fecha: 2026-06-24
-- ════════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────────
--  PASO 1 (solo lectura) — ¿Qué CHECK constraints hay hoy sobre "estado"?
--  Si alguno NO menciona 'pausada', ése es el que bloquea. El PASO 2 lo quita.
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.conrelid::regclass AS tabla,
       c.conname            AS constraint,
       pg_get_constraintdef(c.oid) AS definicion
FROM pg_constraint c
WHERE c.conrelid IN ('campanas'::regclass, 'campana_talentos'::regclass)
  AND c.contype = 'c'
  AND pg_get_constraintdef(c.oid) ILIKE '%estado%'
ORDER BY 1, 2;


-- ────────────────────────────────────────────────────────────────────────────
--  PASO 2 — Quitar SÓLO los CHECK de "estado" que NO incluyan 'pausada'.
--  No toca nada más. Si no hay ninguno, no hace nada (no es el problema y el
--  error real lo va a mostrar ahora el frontend, ya corregido).
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    WHERE c.conrelid IN ('campanas'::regclass, 'campana_talentos'::regclass)
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%estado%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%pausada%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    RAISE NOTICE 'Quitado CHECK "%" de % (no permitía pausada)', r.conname, r.tbl;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
--  PASO 3 (solo lectura) — Confirmar. La consulta del PASO 1 no debería
--  devolver ya ningún constraint que omita 'pausada'.
-- ────────────────────────────────────────────────────────────────────────────
SELECT c.conrelid::regclass AS tabla,
       c.conname            AS constraint,
       pg_get_constraintdef(c.oid) AS definicion
FROM pg_constraint c
WHERE c.conrelid IN ('campanas'::regclass, 'campana_talentos'::regclass)
  AND c.contype = 'c'
  AND pg_get_constraintdef(c.oid) ILIKE '%estado%'
ORDER BY 1, 2;
