-- Auto-finalización de campañas
-- Una campaña pasa a "finalizada" automáticamente cuando TODAS sus sub-campañas
-- (campana_talentos) tienen todos sus contenidos completados (paso_actual >= 8),
-- la campaña no está "sin_iniciar", y pasaron 3 días sin cambios desde que quedó completa.
--
-- `completado_en` guarda el momento en que la campaña fue detectada como 100% completa.
-- Si se agrega un talento nuevo o se reabre manualmente, se limpia (NULL) y el reloj se reinicia.
-- La lógica vive en el cliente (campanas.html → autoFinalizeCampanas), esta columna es el soporte.

ALTER TABLE campanas
  ADD COLUMN IF NOT EXISTS completado_en timestamptz;
