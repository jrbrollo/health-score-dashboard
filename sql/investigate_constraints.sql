-- Investigar todos os triggers, constraints e checks na tabela clients

-- 1. Listar TODOS os triggers
SELECT 
  tgname as trigger_name,
  tgenabled as enabled,
  pg_get_triggerdef(oid) as definition
FROM pg_trigger 
WHERE tgrelid = 'clients'::regclass;

-- 2. Listar todas as constraints
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'clients'::regclass;

-- 3. Verificar se há alguma função sendo chamada automaticamente
SELECT 
  column_name,
  column_default,
  data_type
FROM information_schema.columns
WHERE table_name = 'clients'
  AND column_default IS NOT NULL;





