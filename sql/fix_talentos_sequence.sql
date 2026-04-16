-- ============================================================
-- FIX: resetear la secuencia de talentos.id
-- ============================================================
-- Síntoma: al graduar un contacto a Talento sale:
--   "duplicate key value violates unique constraint talentos_pkey"
-- Causa: se importaron filas con id explícito (ej: import CSV del
-- 2026-04-16) y la secuencia interna de Postgres no se actualizó,
-- así que el siguiente nextval() devuelve un id que ya existe.
-- Solución: llevar la secuencia al MAX(id)+1.
-- Ejecutar en Supabase → SQL Editor.
-- ============================================================

SELECT setval(
  pg_get_serial_sequence('talentos', 'id'),
  COALESCE((SELECT MAX(id) FROM talentos), 0) + 1,
  false
);

-- Verificar (opcional): debería devolver el próximo id que se asignará
SELECT nextval(pg_get_serial_sequence('talentos', 'id'));
-- ⚠️ Ojo: el nextval de arriba consume el número. Si lo corrés solo
-- para verificar, corré el setval de nuevo después.
