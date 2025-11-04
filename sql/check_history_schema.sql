-- Verificar schema da tabela health_score_history
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'health_score_history'
ORDER BY ordinal_position;


