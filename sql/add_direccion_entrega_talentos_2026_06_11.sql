-- Dirección de Entrega en el perfil del talento (envío de PR boxes / regalos / producto).
-- Estructura jsonb: { destinatario, calle, ciudad, provincia, cp, pais, telefono, notas }
ALTER TABLE talentos
  ADD COLUMN IF NOT EXISTS direccion_entrega jsonb DEFAULT '{}'::jsonb;
