-- Script para configurar o banco de dados no Supabase
-- Execute este script no SQL Editor do Supabase

-- Criar tabela de clientes
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  planner TEXT NOT NULL,
  last_meeting TEXT NOT NULL,
  has_scheduled_meeting BOOLEAN NOT NULL,
  app_usage TEXT NOT NULL,
  payment_status TEXT NOT NULL,
  has_referrals BOOLEAN NOT NULL,
  nps_score TEXT NOT NULL,
  ecosystem_usage TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_clients_planner ON clients(planner);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients(updated_at);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at 
    BEFORE UPDATE ON clients 
    FOR EACH ROW 
    EXECUTE PROCEDURE update_updated_at_column();

-- Habilitar Row Level Security (RLS)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Política para permitir todas as operações (simplificado para desenvolvimento)
-- Em produção, você pode criar políticas mais específicas
CREATE POLICY "Enable all operations for clients" ON clients
FOR ALL USING (true);

-- Verificar se a tabela foi criada
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'clients' 
ORDER BY ordinal_position;

