-- Script de debug para testar inserção de um cliente
-- Execute este comando no SQL Editor do Supabase

-- Desabilitar temporariamente o trigger
ALTER TABLE clients DISABLE TRIGGER clients_health_history_trigger;

-- Tentar inserir um cliente de teste
INSERT INTO clients (
  name,
  email,
  phone,
  planner,
  leader,
  mediator,
  manager,
  is_spouse,
  months_since_closing,
  nps_score_v3,
  has_nps_referral,
  overdue_installments,
  overdue_days,
  cross_sell_count,
  meetings_enabled,
  last_meeting,
  has_scheduled_meeting,
  app_usage,
  payment_status,
  has_referrals,
  nps_score,
  ecosystem_usage
) VALUES (
  'TESTE Cliente',
  'teste@email.com',
  '5519996573733', -- Este é o número que está dando erro
  'Fabrício Viana',
  'Gustavo Machado',
  'Gustavo Machado',
  'Rafael Kanashiro',
  false,
  0,
  10,
  false,
  0,
  0,
  1,
  false,
  'Nunca',
  false,
  'Nunca usou',
  'Em dia',
  false,
  'Não avaliado',
  'Não usa'
) RETURNING id, name, phone;

-- Reabilitar o trigger
ALTER TABLE clients ENABLE TRIGGER clients_health_history_trigger;

-- Deletar o cliente de teste
DELETE FROM clients WHERE name = 'TESTE Cliente';



