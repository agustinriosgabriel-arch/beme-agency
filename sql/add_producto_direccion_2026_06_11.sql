-- Dirección de Entrega por talento en una campaña (envío del producto/PR box).
-- Se pre-llena desde la dirección del contacto pero es editable/adaptable por campaña.
-- Estructura jsonb: { destinatario, calle, ciudad, provincia, cp, pais, telefono, notas }
ALTER TABLE campana_talentos
  ADD COLUMN IF NOT EXISTS producto_direccion jsonb DEFAULT '{}'::jsonb;
