-- ⚠️ CLEANUP: Borrar todos los leads y conversaciones relacionadas
-- Mantiene: quota_targets y quota_region_caps (configuración de cuotas)
--
-- Ejecutar en orden (respetando foreign keys):

-- 1. Desactivar constraint checks temporalmente (si es necesario)
-- SET CONSTRAINTS ALL DEFERRED;

-- 2. Borrar embeddings primero (referencia a treinta_panelist_records)
DELETE FROM treinta_panelist_embeddings;

-- 3. Borrar registros Treinta
DELETE FROM treinta_panelist_records;

-- 4. Borrar logs y evaluaciones
DELETE FROM system_call_logs WHERE lead_id IS NOT NULL;
DELETE FROM conversation_evals WHERE lead_id IS NOT NULL;
DELETE FROM conversation_messages WHERE lead_id IS NOT NULL;

-- 5. Borrar datos de leads
DELETE FROM re_engagement_schedules;
DELETE FROM flow_states;
DELETE FROM ficha_hogar_profiles;
DELETE FROM survey_profiles;

-- 6. Borrar leads
DELETE FROM leads;

-- 7. Verificar que las cuotas siguen intactas (debería retornar filas)
SELECT COUNT(*) as quota_targets_count FROM quota_targets;
SELECT COUNT(*) as quota_region_caps_count FROM quota_region_caps;

-- Resumen esperado:
-- - Todos los leads: 0
-- - Todas las survey_profiles: 0
-- - Todas las ficha_hogar_profiles: 0
-- - Todos los treinta_panelist_records: 0
-- - Todos los treinta_panelist_embeddings: 0
-- - quota_targets: > 0 (mantiene configuración)
-- - quota_region_caps: > 0 (mantiene configuración)
