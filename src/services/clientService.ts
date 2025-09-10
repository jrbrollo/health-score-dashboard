import { supabase, DatabaseClient } from '@/lib/supabase'
import { Client } from '@/types/client'

// Converter do formato da aplicação para o banco
function clientToDatabase(client: Client): Omit<DatabaseClient, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: client.name,
    planner: client.planner,
    last_meeting: client.lastMeeting,
    has_scheduled_meeting: client.hasScheduledMeeting,
    app_usage: client.appUsage,
    payment_status: client.paymentStatus,
    has_referrals: client.hasReferrals,
    nps_score: client.npsScore,
    ecosystem_usage: client.ecosystemUsage,
  }
}

// Converter do banco para o formato da aplicação
function databaseToClient(dbClient: DatabaseClient): Client {
  return {
    id: dbClient.id,
    name: dbClient.name,
    planner: dbClient.planner as any,
    lastMeeting: dbClient.last_meeting as any,
    hasScheduledMeeting: dbClient.has_scheduled_meeting,
    appUsage: dbClient.app_usage as any,
    paymentStatus: dbClient.payment_status as any,
    hasReferrals: dbClient.has_referrals,
    npsScore: dbClient.nps_score as any,
    ecosystemUsage: dbClient.ecosystem_usage as any,
    createdAt: new Date(dbClient.created_at),
    updatedAt: new Date(dbClient.updated_at),
  }
}

export const clientService = {
  // Buscar todos os clientes
  async getAllClients(): Promise<Client[]> {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Erro ao buscar clientes:', error)
        throw error
      }

      return data ? data.map(databaseToClient) : []
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
  async createMultipleClients(clientsData: Omit<Client, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<Client[]> {
    try {
      const dbClients = clientsData.map(clientData => 
        clientToDatabase({
          ...clientData,
          id: '',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      )

      const { data, error } = await supabase
        .from('clients')
        .insert(dbClients)
        .select()

      if (error) {
        console.error('Erro ao criar múltiplos clientes:', error)
        throw error
      }

      return data ? data.map(databaseToClient) : []
    } catch (error) {
      console.error('Erro no createMultipleClients:', error)
      return []
    }
  }
}
