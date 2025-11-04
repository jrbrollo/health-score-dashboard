-- Teste direto de inserção com telefone problemático
-- Execute este comando no SQL Editor do Supabase

-- Inserir cliente com telefone longo
INSERT INTO clients (
  name,
  planner,
  phone,
  last_meeting,
  has_scheduled_meeting,
  app_usage,
  payment_status,
  has_referrals,
  nps_score,
  ecosystem_usage
) VALUES (
  'TESTE Danielle',
  'Teste Planner',
  '5519996573733', -- Este é o telefone problemático
  'Nunca',
  false,
  'Nunca usou',
  'Em dia',
  false,
  'Não avaliado',
  'Não usa'
) RETURNING id, name, phone;








