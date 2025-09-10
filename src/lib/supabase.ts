import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pdlyaqxrkoqbqniercpi.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E'

export const supabase = createClient(supabaseUrl, supabaseKey)

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
