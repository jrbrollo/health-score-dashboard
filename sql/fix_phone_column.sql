-- Script para garantir que a coluna phone seja TEXT (não INTEGER)
-- Execute este comando no SQL Editor do Supabase

-- Verificar o tipo atual da coluna phone
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'phone';

-- Se necessário, alterar para TEXT (caso esteja como INTEGER por engano)
-- ALTER TABLE clients ALTER COLUMN phone TYPE TEXT;

-- Verificar todos os tipos de colunas da tabela clients
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
ORDER BY ordinal_position;


