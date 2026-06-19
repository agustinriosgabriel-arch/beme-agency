-- Agrega columna es_exclusivo a la tabla talentos.
-- Sin ella, dashboard.js falla con 42703 y no carga ningún talento.
-- Habilita las áreas de Billetera e Ideas en el Portal del Talento.

ALTER TABLE public.talentos
  ADD COLUMN IF NOT EXISTS es_exclusivo boolean NOT NULL DEFAULT false;
