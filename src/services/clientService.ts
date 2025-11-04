import { supabase, DatabaseClient } from '@/lib/supabase'
import { Client } from '@/types/client'

// Converter do formato da aplicação para o banco (v3)
function clientToDatabase(client: Client): any {
  return {
    name: client.name,
    planner: client.planner,
    phone: client.phone ? String(client.phone) : null,
    email: client.email || null,
    leader: client.leader || null,
    mediator: client.mediator || null,
    manager: client.manager || null,
    is_spouse: client.isSpouse || false,
    months_since_closing: client.monthsSinceClosing ?? null,
    nps_score_v3: client.npsScoreV3 ?? null,
    has_nps_referral: client.hasNpsReferral || false,
    overdue_installments: client.overdueInstallments || 0,
    overdue_days: client.overdueDays || 0,
    cross_sell_count: client.crossSellCount || 0,
    meetings_enabled: client.meetingsEnabled || false,
    // Campos v2 (deprecated, valores padrão para compatibilidade)
    last_meeting: client.lastMeeting || 'Nunca',
    has_scheduled_meeting: client.hasScheduledMeeting || false,
    app_usage: client.appUsage || 'Nunca usou',
    payment_status: client.paymentStatus || 'Em dia',
    has_referrals: client.hasReferrals || false,
    nps_score: client.npsScore || 'Não avaliado',
    ecosystem_usage: client.ecosystemUsage || 'Não usa',
  }
}

// Converter do banco para o formato da aplicação (v3)
function databaseToClient(dbClient: any): Client {
  // Remover "+" do início do telefone se foi adicionado para forçar string
  const phone = dbClient.phone?.startsWith('+') && /^\+\d+$/.test(dbClient.phone)
    ? dbClient.phone.substring(1)
    : dbClient.phone;
  
  return {
    id: dbClient.id,
    name: dbClient.name,
    email: dbClient.email,
    phone: phone,
    planner: dbClient.planner,
    leader: dbClient.leader,
    mediator: dbClient.mediator,
    manager: dbClient.manager,
    isSpouse: dbClient.is_spouse,
    isActive: dbClient.is_active,
    monthsSinceClosing: dbClient.months_since_closing,
    npsScoreV3: dbClient.nps_score_v3,
    hasNpsReferral: dbClient.has_nps_referral,
    overdueInstallments: dbClient.overdue_installments,
    overdueDays: dbClient.overdue_days,
    crossSellCount: dbClient.cross_sell_count,
    meetingsEnabled: dbClient.meetings_enabled,
    // Campos v2 (deprecated)
    lastMeeting: dbClient.last_meeting,
    hasScheduledMeeting: dbClient.has_scheduled_meeting,
    appUsage: dbClient.app_usage,
    paymentStatus: dbClient.payment_status,
    hasReferrals: dbClient.has_referrals,
    npsScore: dbClient.nps_score,
    ecosystemUsage: dbClient.ecosystem_usage,
    createdAt: new Date(dbClient.created_at),
    updatedAt: new Date(dbClient.updated_at),
  }
}

export const clientService = {
  // Buscar todos os clientes (v3 - filtra cônjuges automaticamente)
  async getAllClients(): Promise<Client[]> {
    try {
      // Snapshot: buscar apenas clientes com last_seen_at na data mais recente (fonte: planilha do dia)
      // 1) Obter a data do último snapshot
      const { data: lastDateRows, error: lastDateError } = await supabase
        .from('clients')
        .select('last_seen_at')
        .not('last_seen_at', 'is', null)
        .order('last_seen_at', { ascending: false })
        .limit(1)
      if (lastDateError) throw lastDateError
      const lastSeenTs: string | null = lastDateRows && lastDateRows[0]?.last_seen_at ? lastDateRows[0].last_seen_at : null

      // 2) Consultar somente o snapshot
      const PAGE_SIZE = 1000
      let offset = 0
      const allRows: any[] = []
      while (true) {
        let query = supabase
          .from('clients')
          .select('*')
          .or('is_spouse.is.null,is_spouse.eq.false')
          .neq('name', '0')
          .neq('planner', '0')
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1)

        if (lastSeenTs) {
          query = query.eq('last_seen_at', lastSeenTs)
        }

        const { data, error } = await query
        if (error) {
          console.error('Erro ao buscar snapshot de clientes:', error)
          throw error
        }
        if (data && data.length > 0) allRows.push(...data)
        if (!data || data.length < PAGE_SIZE) break
        offset += PAGE_SIZE
      }
      return allRows.map(databaseToClient)
    } catch (error) {
      console.error('Erro no getAllClients:', error)
      return []
    }
  },

  // Criar um novo cliente
  async createClient(clientData: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>): Promise<Client | null> {
    try {
      const dbClient = clientToDatabase({
        ...clientData,
        id: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const { data, error } = await supabase
        .from('clients')
        .insert([dbClient])
        .select()
        .single()

      if (error) {
        console.error('Erro ao criar cliente:', error)
        throw error
      }

      return data ? databaseToClient(data) : null
    } catch (error) {
      console.error('Erro no createClient:', error)
      return null
    }
  },

  // Atualizar um cliente
  async updateClient(clientId: string, updates: Partial<Client>): Promise<Client | null> {
    try {
      const updateData: any = {}
      
      if (updates.name) updateData.name = updates.name
      if (updates.planner) updateData.planner = updates.planner
      if (updates.lastMeeting) updateData.last_meeting = updates.lastMeeting
      if (updates.hasScheduledMeeting !== undefined) updateData.has_scheduled_meeting = updates.hasScheduledMeeting
      if (updates.appUsage) updateData.app_usage = updates.appUsage
      if (updates.paymentStatus) updateData.payment_status = updates.paymentStatus
      if (updates.hasReferrals !== undefined) updateData.has_referrals = updates.hasReferrals
      if (updates.npsScore) updateData.nps_score = updates.npsScore
      if (updates.ecosystemUsage) updateData.ecosystem_usage = updates.ecosystemUsage
      
      updateData.updated_at = new Date().toISOString()

      const { data, error } = await supabase
        .from('clients')
        .update(updateData)
        .eq('id', clientId)
        .select()
        .single()

      if (error) {
        console.error('Erro ao atualizar cliente:', error)
        throw error
      }

      return data ? databaseToClient(data) : null
    } catch (error) {
      console.error('Erro no updateClient:', error)
      return null
    }
  },

  // Deletar um cliente
  async deleteClient(clientId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientId)

      if (error) {
        console.error('Erro ao deletar cliente:', error)
        throw error
      }

      return true
    } catch (error) {
      console.error('Erro no deleteClient:', error)
      return false
    }
  },

  // Criar múltiplos clientes (bulk import)
  async createMultipleClients(
    clientsData: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>[],
    options?: { sheetDate?: string }
  ): Promise<Client[]> {
    try {
      console.log('🔍 Tentando inserir', clientsData.length, 'clientes', options?.sheetDate ? `para a data ${options.sheetDate}` : '')
      const BATCH_SIZE = 200
      const allInserted: Client[] = []
      const importedIdentityKeys: string[] = []

      // Derivar data do snapshot (importDate) do lado do app, se existir no CSV futuro
      // Por ora, usa a data atual como fallback
      const seenAt = new Date().toISOString()
      const importDate = (options?.sheetDate && /^\d{4}-\d{2}-\d{2}$/.test(options.sheetDate))
        ? options.sheetDate
        : seenAt.slice(0,10)
      if (!options?.sheetDate) {
        console.log('⚠️ Data da planilha não informada, usando data atual como referência do import:', importDate)
      } else {
        console.log('📅 Data da planilha informada:', options.sheetDate, '→ import_date enviado:', importDate)
      }

      for (let i = 0; i < clientsData.length; i += BATCH_SIZE) {
        const batch = clientsData.slice(i, i + BATCH_SIZE)
        const dbBatch = batch.map(c => clientToDatabase({
          ...c,
          id: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        }))

        try {
          const dist = dbBatch.reduce((acc: any, c: any) => {
            const v = typeof c.cross_sell_count === 'number' ? c.cross_sell_count : parseInt(String(c.cross_sell_count || '0'), 10) || 0;
            const key = v >= 3 ? '3+' : String(v);
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          console.log('📦 Lote cross_sell_count dist:', dist);
          const sample = dbBatch.find((c: any) => (typeof c.cross_sell_count === 'number' ? c.cross_sell_count : parseInt(String(c.cross_sell_count || '0'), 10) || 0) > 0);
          if (sample) {
            console.log('🧪 Exemplo payload com cross_sell_count>0:', sample);
          }
        } catch (e) {
          console.warn('Warn ao calcular dist de cross_sell_count (lote):', e);
        }

        console.log(`📦 Inserindo lote ${Math.floor(i / BATCH_SIZE) + 1}: clientes ${i + 1} a ${i + dbBatch.length}`)

        const { data, error } = await supabase.rpc('bulk_insert_clients_v3', {
          clients_json: dbBatch,
          p_import_date: importDate,
          p_seen_at: seenAt
        } as any)

        if (error) {
          console.error('❌ Erro ao inserir lote (bulk_insert_clients):', error)
          throw error
        }

        if (data && Array.isArray(data)) {
          // Coletar identity_keys diretamente do payload retornado
          try {
            for (const row of data as any[]) {
              if (row.identity_key) importedIdentityKeys.push(row.identity_key)
            }
          } catch (e) {
            console.warn('Warn ao coletar identity_keys do retorno:', e)
          }
          allInserted.push(...data.map(databaseToClient))
        }
      }

      console.log('✅ Todos os clientes criados/atualizados com sucesso:', allInserted.length)
      try {
        const distInserted = allInserted.reduce((acc: any, c) => {
          const v = c.crossSellCount ?? 0;
          const key = v >= 3 ? '3+' : String(v);
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log('📥 Distribuição crossSellCount (retorno RPC):', distInserted);
      } catch (e) {
        console.warn('Warn ao calcular distribuição pós-RPC:', e);
      }

      // Pausado: não finalizar automaticamente enquanto validamos coesão com a planilha
      return allInserted
    } catch (error) {
      console.error('❌ Erro no createMultipleClients:', error)
      throw error // Re-throw para propagar o erro
    }
  }
}

