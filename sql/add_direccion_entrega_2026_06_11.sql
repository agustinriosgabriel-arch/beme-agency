-- Dirección de Entrega para contactos de prospección (envío de PR boxes / regalos)
-- Estructura jsonb: { destinatario, calle, ciudad, provincia, cp, pais, telefono, notas }
ALTER TABLE prospeccion_contactos
  ADD COLUMN IF NOT EXISTS direccion_entrega jsonb DEFAULT '{}'::jsonb;
