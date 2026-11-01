-- Check-in compartido de eventos (lista de invitados en /invitados-halloween)
-- Una fila por invitado que ya llegó. Marcar = insertar, desmarcar = borrar,
-- así dos celulares en la puerta nunca se pisan los cambios.
--
-- La página es pública (sin login, la usa el staff de puerta), por eso anon
-- puede leer/escribir — pero SOLO filas de eventos habilitados abajo.
-- Correr una vez en Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS evento_checkins (
  evento    text        NOT NULL,
  nombre    text        NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 120),
  llegada   timestamptz NOT NULL DEFAULT now(),
  agregado  boolean     NOT NULL DEFAULT false,  -- true = no estaba en la lista, se sumó en puerta
  PRIMARY KEY (evento, nombre)
);

ALTER TABLE evento_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evento_checkins_auth_all ON evento_checkins;
CREATE POLICY evento_checkins_auth_all ON evento_checkins
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Puerta (anon): solo el evento activo. Para un evento nuevo, sumarlo a la lista.
DROP POLICY IF EXISTS evento_checkins_anon_rw ON evento_checkins;
CREATE POLICY evento_checkins_anon_rw ON evento_checkins
  FOR ALL TO anon
  USING (evento IN ('halloween26'))
  WITH CHECK (evento IN ('halloween26'));

GRANT SELECT, INSERT, UPDATE, DELETE ON evento_checkins TO anon, authenticated;

-- Realtime: que los demás celulares vean cada check-in al instante.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE evento_checkins;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
