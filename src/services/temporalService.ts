import { supabase } from '@/lib/supabase';
import { HealthScoreHistory, TemporalAnalysis, TrendAnalysis, PeriodComparison } from '@/types/temporal';
import { Planner } from '@/types/client';

const round2 = (value: number) => Math.round(value * 100) / 100;
const averageFromRecords = (records: any[], selector: (record: any) => number | null | undefined) => {
  if (!records || records.length === 0) return 0;
  const sum = records.reduce((acc, record) => acc + (selector(record) ?? 0), 0);
  return sum / records.length;
};

const parseDateFromDb = (value: string | Date | null | undefined): Date => {
  if (!value) return new Date();
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const text = value.toString();
  const isoDate = text.includes('T') ? text.split('T')[0] : text;
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
    return new Date(year, month - 1, day);
  }

  // Fallback para casos inesperados
  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
};

// Converter dados do banco para o formato da aplicação
function databaseToTemporalAnalysis(dbData: any): TemporalAnalysis {
  return {
    recordedDate: parseDateFromDb(dbData.recorded_date),
    planner: dbData.planner,
    totalClients: parseInt(dbData.total_clients),
    avgHealthScore: parseFloat(dbData.avg_health_score),
    excellentCount: parseInt(dbData.excellent_count),
    stableCount: parseInt(dbData.stable_count),
    warningCount: parseInt(dbData.warning_count),
    criticalCount: parseInt(dbData.critical_count),
    avgMeetingEngagement: parseFloat(dbData.avg_meeting_engagement),
    avgAppUsage: parseFloat(dbData.avg_app_usage),
    avgPaymentStatus: parseFloat(dbData.avg_payment_status),
    avgEcosystemEngagement: parseFloat(dbData.avg_ecosystem_engagement),
    avgNpsScore: parseFloat(dbData.avg_nps_score),
  };
}

function databaseToHealthScoreHistory(dbData: any): HealthScoreHistory {
  // Usar campos v3 se disponíveis, senão usar v2 (compatibilidade)
  const hasV3Pillars = dbData.nps_score_v3_pillar !== null && dbData.nps_score_v3_pillar !== undefined;
  
  return {
    id: dbData.id,
    clientId: dbData.client_id,
    recordedDate: parseDateFromDb(dbData.recorded_date),
    clientName: dbData.client_name,
    planner: dbData.planner,
    healthScore: dbData.health_score,
    healthCategory: dbData.health_category,
    breakdown: hasV3Pillars ? {
      // V3: Pilares corretos
      nps: dbData.nps_score_v3_pillar ?? 0,
      referral: dbData.referral_pillar ?? 0,
      payment: dbData.payment_pillar ?? 0,
      crossSell: dbData.cross_sell_pillar ?? 0,
      tenure: dbData.tenure_pillar ?? 0,
      // Campos v2 para compatibilidade (deprecated)
      meetingEngagement: dbData.meeting_engagement ?? 0,
      appUsage: dbData.app_usage ?? 0,
      paymentStatus: dbData.payment_status ?? 0,
      ecosystemEngagement: dbData.ecosystem_engagement ?? 0,
      npsScore: dbData.nps_score ?? 0,
    } : {
      // V2: Fallback para dados antigos
      meetingEngagement: dbData.meeting_engagement ?? 0,
      appUsage: dbData.app_usage ?? 0,
      paymentStatus: dbData.payment_status ?? 0,
      ecosystemEngagement: dbData.ecosystem_engagement ?? 0,
      npsScore: dbData.nps_score ?? 0,
    },
    originalData: {
      lastMeeting: dbData.last_meeting,
      hasScheduledMeeting: dbData.has_scheduled_meeting,
      appUsageStatus: dbData.app_usage_status,
      paymentStatusDetail: dbData.payment_status_detail,
      hasReferrals: dbData.has_referrals,
      npsScoreDetail: dbData.nps_score_detail,
      ecosystemUsage: dbData.ecosystem_usage,
    },
    createdAt: new Date(dbData.created_at),
  };
}

export const temporalService = {
  // Obter análise temporal para um período específico (AS-OF)
  async getTemporalAnalysis(
    startDate: Date,
    endDate: Date,
    planner?: Planner | "all",
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[]; includeNulls?: { manager?: boolean; mediator?: boolean; leader?: boolean } }
  ): Promise<TemporalAnalysis[]> {
    try {
      // Tenta RPC as-of; se não existir (404), volta para view antiga
      const { data, error } = await supabase
        .rpc('get_temporal_analysis_asof', {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          planner_filter: planner ?? 'all',
          managers: hierarchyFilters?.managers ?? null,
          mediators: hierarchyFilters?.mediators ?? null,
          leaders: hierarchyFilters?.leaders ?? null,
          include_null_manager: hierarchyFilters?.includeNulls?.manager ?? false,
          include_null_mediator: hierarchyFilters?.includeNulls?.mediator ?? false,
          include_null_leader: hierarchyFilters?.includeNulls?.leader ?? false,
        });

      if (error || !data) {
        return this.calculatePlannerAnalysis(startDate, endDate, planner ?? 'all', hierarchyFilters);
      }

      return data.map(databaseToTemporalAnalysis);
    } catch (error) {
      console.error('Erro no getTemporalAnalysis:', error);
      return this.calculatePlannerAnalysis(startDate, endDate, planner ?? 'all', hierarchyFilters);
    }
  },

  // Obter análise temporal agregada (todos os planejadores) AS-OF
  async getAggregatedTemporalAnalysis(
    startDate: Date,
    endDate: Date,
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[]; includeNulls?: { manager?: boolean; mediator?: boolean; leader?: boolean } }
  ): Promise<TemporalAnalysis[]> {
    try {
      // Se houver filtros hierárquicos, calcular manualmente a partir do histórico
      if (hierarchyFilters && (
        (hierarchyFilters.managers && hierarchyFilters.managers.length > 0) ||
        (hierarchyFilters.mediators && hierarchyFilters.mediators.length > 0) ||
        (hierarchyFilters.leaders && hierarchyFilters.leaders.length > 0)
      )) {
        return this.calculateAggregatedAnalysis(startDate, endDate, hierarchyFilters);
      }
      const { data, error } = await supabase
        .rpc('get_temporal_analysis_asof', {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          planner_filter: 'all',
          managers: hierarchyFilters?.managers ?? null,
          mediators: hierarchyFilters?.mediators ?? null,
          leaders: hierarchyFilters?.leaders ?? null,
          include_null_manager: hierarchyFilters?.includeNulls?.manager ?? false,
          include_null_mediator: hierarchyFilters?.includeNulls?.mediator ?? false,
          include_null_leader: hierarchyFilters?.includeNulls?.leader ?? false,
        });

      if (error || !data) {
        return this.calculateAggregatedAnalysis(startDate, endDate, hierarchyFilters);
      }

      return data.map((item: any) => ({
        ...databaseToTemporalAnalysis(item),
        planner: 'all' as const
      }));
    } catch (error) {
      console.error('Erro no getAggregatedTemporalAnalysis:', error);
      // Fallback: agregar manualmente
      return this.calculateAggregatedAnalysis(startDate, endDate);
    }
  },

  // Calcular análise agregada manualmente (fallback)
  async calculateAggregatedAnalysis(
    startDate: Date,
    endDate: Date,
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[]; includeNulls?: { manager?: boolean; mediator?: boolean; leader?: boolean } }
  ): Promise<TemporalAnalysis[]> {
    try {
      // Buscar dados com paginação para evitar timeout
      let allData: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('health_score_history')
          .select('*')
          .gte('recorded_date', startDate.toISOString().split('T')[0])
          .lte('recorded_date', endDate.toISOString().split('T')[0])
          .neq('planner', '0')
          .neq('client_name', '0')
          .range(offset, offset + pageSize - 1)
          .order('recorded_date', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
          allData = allData.concat(data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const data = allData;

      let filteredData = data ?? [];

      if (hierarchyFilters) {
        if (hierarchyFilters.managers && hierarchyFilters.managers.length > 0) {
          filteredData = filteredData.filter(record => {
            if (!record.manager) return Boolean(hierarchyFilters.includeNulls?.manager);
            return hierarchyFilters.managers!.includes(record.manager);
          });
        }
        if (hierarchyFilters.mediators && hierarchyFilters.mediators.length > 0) {
          filteredData = filteredData.filter(record => {
            if (!record.mediator) return Boolean(hierarchyFilters.includeNulls?.mediator);
            return hierarchyFilters.mediators!.includes(record.mediator);
          });
        }
        if (hierarchyFilters.leaders && hierarchyFilters.leaders.length > 0) {
          filteredData = filteredData.filter(record => {
            if (!record.leader) return Boolean(hierarchyFilters.includeNulls?.leader);
            return hierarchyFilters.leaders!.includes(record.leader);
          });
        }
      }

      const groupedByDate = filteredData.reduce((acc, record) => {
        const date = record.recorded_date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(record);
        return acc;
      }, {} as Record<string, any[]>) || {};

      const aggregated = Object.entries(groupedByDate).map(([date, records]) => {
        const totalClients = records.length;
        const avgHealthScore = averageFromRecords(records, r => r.health_score ?? 0);
        
        return {
          recordedDate: parseDateFromDb(date),
          planner: "all" as const,
          totalClients,
          avgHealthScore: round2(avgHealthScore),
          excellentCount: records.filter(r => r.health_category === 'Ótimo').length,
          stableCount: records.filter(r => r.health_category === 'Estável').length,
          warningCount: records.filter(r => r.health_category === 'Atenção').length,
          criticalCount: records.filter(r => r.health_category === 'Crítico').length,
          avgMeetingEngagement: round2(averageFromRecords(records, r => r.meeting_engagement ?? 0)),
          avgAppUsage: round2(averageFromRecords(records, r => r.app_usage ?? 0)),
          avgPaymentStatus: round2(averageFromRecords(records, r => r.payment_status ?? 0)),
          avgEcosystemEngagement: round2(averageFromRecords(records, r => r.ecosystem_engagement ?? 0)),
          avgNpsScore: round2(averageFromRecords(records, r => r.nps_score ?? 0)),
        };
      });

      return aggregated.sort((a, b) => a.recordedDate.getTime() - b.recordedDate.getTime());
    } catch (error) {
      console.error('Erro no calculateAggregatedAnalysis:', error);
      return [];
    }
  },

  async calculatePlannerAnalysis(
    startDate: Date,
    endDate: Date,
    planner: Planner | "all",
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[]; includeNulls?: { manager?: boolean; mediator?: boolean; leader?: boolean } }
  ): Promise<TemporalAnalysis[]> {
    if (!planner || planner === 'all') {
      return this.calculateAggregatedAnalysis(startDate, endDate, hierarchyFilters);
    }

    try {
      // Buscar dados com paginação para evitar timeout
      let allData: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('health_score_history')
          .select('*')
          .eq('planner', planner)
          .gte('recorded_date', startDate.toISOString().split('T')[0])
          .lte('recorded_date', endDate.toISOString().split('T')[0])
          .range(offset, offset + pageSize - 1)
          .order('recorded_date', { ascending: true });
        
        if (error) throw error;

        if (data && data.length > 0) {
          allData = allData.concat(data);
          offset += pageSize;
          hasMore = data.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const data = allData;

      let filteredData = data ?? [];

      if (hierarchyFilters) {
        if (hierarchyFilters.managers && hierarchyFilters.managers.length > 0) {
          filteredData = filteredData.filter(record => {
            if (!record.manager) return Boolean(hierarchyFilters.includeNulls?.manager);
            return hierarchyFilters.managers!.includes(record.manager);
          });
        }
        if (hierarchyFilters.mediators && hierarchyFilters.mediators.length > 0) {
          filteredData = filteredData.filter(record => {
            if (!record.mediator) return Boolean(hierarchyFilters.includeNulls?.mediator);
            return hierarchyFilters.mediators!.includes(record.mediator);
          });
        }
        if (hierarchyFilters.leaders && hierarchyFilters.leaders.length > 0) {
          filteredData = filteredData.filter(record => {
            if (!record.leader) return Boolean(hierarchyFilters.includeNulls?.leader);
            return hierarchyFilters.leaders!.includes(record.leader);
          });
        }
      }

      const groupedByDate = filteredData.reduce((acc, record) => {
        const date = record.recorded_date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(record);
        return acc;
      }, {} as Record<string, any[]>) || {};

      const aggregated = Object.entries(groupedByDate).map(([date, records]) => {
        const totalClients = records.length;

        return {
          recordedDate: parseDateFromDb(date),
          planner,
          totalClients,
          avgHealthScore: round2(averageFromRecords(records, r => r.health_score ?? 0)),
          excellentCount: records.filter(r => r.health_category === 'Ótimo').length,
          stableCount: records.filter(r => r.health_category === 'Estável').length,
          warningCount: records.filter(r => r.health_category === 'Atenção').length,
          criticalCount: records.filter(r => r.health_category === 'Crítico').length,
          avgMeetingEngagement: round2(averageFromRecords(records, r => r.meeting_engagement ?? 0)),
          avgAppUsage: round2(averageFromRecords(records, r => r.app_usage ?? 0)),
          avgPaymentStatus: round2(averageFromRecords(records, r => r.payment_status ?? 0)),
          avgEcosystemEngagement: round2(averageFromRecords(records, r => r.ecosystem_engagement ?? 0)),
          avgNpsScore: round2(averageFromRecords(records, r => r.nps_score ?? 0)),
        };
      });

      return aggregated.sort((a, b) => a.recordedDate.getTime() - b.recordedDate.getTime());
    } catch (error) {
      console.error('Erro no calculatePlannerAnalysis:', error);
      return [];
    }
  },

  // Calcular análise de tendência (janelas ancoradas e ponderadas)
  async getTrendAnalysis(
    planner: Planner | "all",
    periodDays: number = 30,
    customStartDate?: Date,
    customEndDate?: Date,
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[] }
  ): Promise<TrendAnalysis | null> {
    try {
      const endDate = customEndDate || new Date();
      const startDate = customStartDate || (() => {
        const date = new Date();
        date.setDate(date.getDate() - periodDays);
        return date;
      })();

      const currentData = planner === "all" 
        ? await this.getAggregatedTemporalAnalysis(startDate, endDate, hierarchyFilters)
        : await this.getTemporalAnalysis(startDate, endDate, planner, hierarchyFilters);

      if (currentData.length < 2) {
        return null; // Dados insuficientes para análise de tendência
      }

      // Definir janelas: últimos N/2 dias (janela atual) vs N/2 dias anteriores (janela anterior)
      const windowSize = Math.max(1, Math.floor(currentData.length / 2));
      const recent = currentData.slice(-windowSize);
      const prior = currentData.slice(-2 * windowSize, -windowSize);

      // Médias ponderadas por totalClients
      const weightedAvg = (arr: typeof currentData, selector: (d: any) => number) => {
        const totalWeight = arr.reduce((w, d) => w + (d.totalClients || 0), 0);
        if (totalWeight === 0) return 0;
        const weightedSum = arr.reduce((sum, d) => sum + selector(d) * (d.totalClients || 0), 0);
        return weightedSum / totalWeight;
      };

      const avgRecent = weightedAvg(recent, d => d.avgHealthScore);
      const avgPrior = weightedAvg(prior, d => d.avgHealthScore);

      const clientRecent = Math.round(recent.reduce((s, d) => s + d.totalClients, 0) / recent.length);
      const clientPrior = Math.round(prior.reduce((s, d) => s + d.totalClients, 0) / Math.max(1, prior.length));

      const scoreChange = avgRecent - avgPrior;
      const scoreChangePercent = avgPrior > 0 ? (scoreChange / avgPrior) * 100 : 0;
      const clientCountChange = clientRecent - clientPrior;

      // Determinar tendência geral
      let overallTrend: 'improving' | 'declining' | 'stable' = 'stable';
      if (Math.abs(scoreChangePercent) > 5) {
        overallTrend = scoreChangePercent > 0 ? 'improving' : 'declining';
      }

      // Analisar mudanças por pilar
      const improvements = [];
      const concerns = [];

      const weightedDelta = (selector: (d: any) => number) => weightedAvg(recent, selector) - weightedAvg(prior, selector);
      const pillarChanges = {
        'Reuniões': weightedDelta(d => d.avgMeetingEngagement),
        'App Usage': weightedDelta(d => d.avgAppUsage),
        'Pagamentos': weightedDelta(d => d.avgPaymentStatus),
        'Ecossistema': weightedDelta(d => d.avgEcosystemEngagement),
        'NPS': weightedDelta(d => d.avgNpsScore),
      };

      Object.entries(pillarChanges).forEach(([category, change]) => {
        if (Math.abs(change) > 1) { // Mudança significativa > 1 ponto
          if (change > 0) {
            improvements.push({ category, change: Math.round(change * 100) / 100 });
          } else {
            concerns.push({ category, change: Math.round(Math.abs(change) * 100) / 100 });
          }
        }
      });

      return {
        planner,
        periodDays,
        scoreChange: Math.round(scoreChange * 100) / 100,
        scoreChangePercent: Math.round(scoreChangePercent * 100) / 100,
        clientCountChange: Math.round(clientCountChange * 100) / 100,
        overallTrend,
        improvements: improvements.sort((a, b) => b.change - a.change),
        concerns: concerns.sort((a, b) => b.change - a.change),
      };
    } catch (error) {
      console.error('Erro no getTrendAnalysis:', error);
      return null;
    }
  },

  // Forçar registro de histórico para clientes existentes (útil para populacao inicial)
  async backfillHistoryForExistingClients(): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('backfill_health_score_history');

      if (error) {
        console.error('Erro ao popular histórico:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Erro no backfillHistoryForExistingClients:', error);
      return false;
    }
  },

  // Obter últimos registros por planejador
  async getLatestScoresByPlanner(): Promise<Record<string, number>> {
    try {
      const { data, error } = await supabase
        .from('temporal_health_analysis')
        .select('planner, avg_health_score')
        .order('recorded_date', { ascending: false })
        .limit(20); // Últimos registros

      if (error) throw error;

      // Agrupar por planejador (pegar o mais recente de cada um)
      const latestByPlanner: Record<string, number> = {};
      data?.forEach(record => {
        if (!latestByPlanner[record.planner]) {
          latestByPlanner[record.planner] = record.avg_health_score;
        }
      });

      return latestByPlanner;
    } catch (error) {
      console.error('Erro no getLatestScoresByPlanner:', error);
      return {};
    }
  },

  // Obter histórico de um cliente específico
  async getClientHistory(clientId: string): Promise<HealthScoreHistory[]> {
    try {
      const { data, error } = await supabase
        .from('health_score_history')
        .select('*')
        .eq('client_id', clientId)
        .order('recorded_date', { ascending: true });

      if (error) throw error;

      return (data || []).map(databaseToHealthScoreHistory);
    } catch (error) {
      console.error('Erro ao buscar histórico do cliente:', error);
      return [];
    }
  }
};
