// Re-exportar do client unificado para evitar múltiplas instâncias
export { supabase } from '@/integrations/supabase/client';

// Tipos para a tabela clients
export interface DatabaseClient {
  id: string
  name: string
  planner: string
  last_meeting: string
  has_scheduled_meeting: boolean
  app_usage: string
  payment_status: string
  has_referrals: boolean
  nps_score: string
  ecosystem_usage: string
  created_at: string
  updated_at: string
}
