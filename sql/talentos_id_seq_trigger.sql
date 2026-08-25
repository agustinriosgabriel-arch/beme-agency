-- ============================================================
-- Candado permanente contra "duplicate key ... talentos_pkey"
-- ============================================================
-- Contexto: la app tiene dos formas de crear talentos.
--   a) Graduar una prospección → INSERT sin id, lo pone la secuencia.
--   b) Restaurar un talento borrado (undo) → INSERT con el id original.
-- El caso (b) no adelanta la secuencia. Si alguna vez queda por encima del
-- contador, el próximo (a) pide un id que ya existe y revienta.
--
-- Este trigger empuja la secuencia cada vez que entra una fila con id
-- explícito, así los dos caminos nunca se cruzan. Correr una sola vez en
-- Supabase → SQL Editor. Es idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.talentos_sync_id_seq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  seq_name text := pg_get_serial_sequence('public.talentos', 'id');
  cur      bigint;
  called   boolean;
BEGIN
  IF NEW.id IS NULL OR seq_name IS NULL THEN
    RETURN NEW;
  END IF;
  EXECUTE format('SELECT last_value, is_called FROM %s', seq_name) INTO cur, called;
  -- is_called = false significa que last_value todavía no se entregó, así que
  -- un id igual a last_value también hay que saltearlo.
  IF NEW.id > cur OR (NEW.id = cur AND NOT called) THEN
    PERFORM setval(seq_name, NEW.id, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talentos_sync_id_seq ON public.talentos;
CREATE TRIGGER trg_talentos_sync_id_seq
BEFORE INSERT ON public.talentos
FOR EACH ROW EXECUTE FUNCTION public.talentos_sync_id_seq();

-- Alinear la secuencia ahora (por si quedó atrasada de antes)
SELECT setval(
  pg_get_serial_sequence('public.talentos', 'id'),
  COALESCE((SELECT MAX(id) FROM public.talentos), 0) + 1,
  false
);
