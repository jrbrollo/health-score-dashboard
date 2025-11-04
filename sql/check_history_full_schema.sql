-- Verificar TODAS as colunas da tabela health_score_history
SELECT 
  ordinal_position,
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'health_score_history'
ORDER BY ordinal_position;



