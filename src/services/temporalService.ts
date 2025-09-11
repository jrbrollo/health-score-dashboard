import { supabase } from '@/lib/supabase';
import { HealthScoreHistory, TemporalAnalysis, TrendAnalysis, PeriodComparison } from '@/types/temporal';
import { Planner } from '@/types/client';

// Converter dados do banco para o formato da aplicação
function databaseToTemporalAnalysis(dbData: any): TemporalAnalysis {
  return {
    recordedDate: new Date(dbData.recorded_date),
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
  return {
    id: dbData.id,
    clientId: dbData.client_id,
    recordedDate: new Date(dbData.recorded_date),
    clientName: dbData.client_name,
    planner: dbData.planner,
    healthScore: dbData.health_score,
    healthCategory: dbData.health_category,
    breakdown: {
      meetingEngagement: dbData.meeting_engagement,
      appUsage: dbData.app_usage,
      paymentStatus: dbData.payment_status,
      ecosystemEngagement: dbData.ecosystem_engagement,
      npsScore: dbData.nps_score,
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
  // Obter análise temporal para um período específico
  async getTemporalAnalysis(
    startDate: Date,
    endDate: Date,
    planner?: Planner | "all"
  ): Promise<TemporalAnalysis[]> {
    try {
      let query = supabase
        .from('temporal_health_analysis')
        .select('*')
        .gte('recorded_date', startDate.toISOString().split('T')[0])
        .lte('recorded_date', endDate.toISOString().split('T')[0])
        .order('recorded_date', { ascending: true });

      if (planner && planner !== "all") {
        query = query.eq('planner', planner);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar análise temporal:', error);
        throw error;
      }

      return data ? data.map(databaseToTemporalAnalysis) : [];
    } catch (error) {
      console.error('Erro no getTemporalAnalysis:', error);
      return [];
    }
  },

  // Obter análise temporal agregada (todos os planejadores)
  async getAggregatedTemporalAnalysis(
    startDate: Date,
    endDate: Date
  ): Promise<TemporalAnalysis[]> {
    try {
      const { data, error } = await supabase
        .rpc('get_aggregated_temporal_analysis', {
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0]
        });

      if (error) {
        console.error('Erro ao buscar análise temporal agregada:', error);
        throw error;
      }

      return data ? data.map((item: any) => ({
        ...databaseToTemporalAnalysis(item),
        planner: "all" as const
      })) : [];
    } catch (error) {
      console.error('Erro no getAggregatedTemporalAnalysis:', error);
      // Fallback: agregar manualmente
      return this.calculateAggregatedAnalysis(startDate, endDate);
    }
  },

  // Calcular análise agregada manualmente (fallback)
  async calculateAggregatedAnalysis(
    startDate: Date,
    endDate: Date
  ): Promise<TemporalAnalysis[]> {
    try {
      const { data, error } = await supabase
        .from('health_score_history')
        .select('*')
        .gte('recorded_date', startDate.toISOString().split('T')[0])
        .lte('recorded_date', endDate.toISOString().split('T')[0]);

      if (error) throw error;

      // Agrupar por data
      const groupedByDate = data?.reduce((acc, record) => {
        const date = record.recorded_date;
        if (!acc[date]) {
          acc[date] = [];
        }
        acc[date].push(record);
        return acc;
      }, {} as Record<string, any[]>) || {};

      // Calcular métricas agregadas por data
      const aggregated = Object.entries(groupedByDate).map(([date, records]) => {
        const totalClients = records.length;
        const avgHealthScore = records.reduce((sum, r) => sum + r.health_score, 0) / totalClients;
        
        return {
          recordedDate: new Date(date),
          planner: "all" as const,
          totalClients,
          avgHealthScore: Math.round(avgHealthScore * 100) / 100,
          excellentCount: records.filter(r => r.health_category === 'Ótimo').length,
          stableCount: records.filter(r => r.health_category === 'Estável').length,
          warningCount: records.filter(r => r.health_category === 'Atenção').length,
          criticalCount: records.filter(r => r.health_category === 'Crítico').length,
          avgMeetingEngagement: Math.round((records.reduce((sum, r) => sum + r.meeting_engagement, 0) / totalClients) * 100) / 100,
          avgAppUsage: Math.round((records.reduce((sum, r) => sum + r.app_usage, 0) / totalClients) * 100) / 100,
          avgPaymentStatus: Math.round((records.reduce((sum, r) => sum + r.payment_status, 0) / totalClients) * 100) / 100,
          avgEcosystemEngagement: Math.round((records.reduce((sum, r) => sum + r.ecosystem_engagement, 0) / totalClients) * 100) / 100,
          avgNpsScore: Math.round((records.reduce((sum, r) => sum + r.nps_score, 0) / totalClients) * 100) / 100,
        };
      });

      return aggregated.sort((a, b) => a.recordedDate.getTime() - b.recordedDate.getTime());
    } catch (error) {
      console.error('Erro no calculateAggregatedAnalysis:', error);
      return [];
    }
  },

  // Calcular análise de tendência
  async getTrendAnalysis(
    planner: Planner | "all",
    periodDays: number = 30
  ): Promise<TrendAnalysis | null> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - periodDays);

      const currentData = planner === "all" 
        ? await this.getAggregatedTemporalAnalysis(startDate, endDate)
        : await this.getTemporalAnalysis(startDate, endDate, planner);

      if (currentData.length < 2) {
        return null; // Dados insuficientes para análise de tendência
      }

      const firstPeriod = currentData.slice(0, Math.floor(currentData.length / 2));
      const secondPeriod = currentData.slice(Math.floor(currentData.length / 2));

      const firstAvg = firstPeriod.reduce((sum, d) => sum + d.avgHealthScore, 0) / firstPeriod.length;
      const secondAvg = secondPeriod.reduce((sum, d) => sum + d.avgHealthScore, 0) / secondPeriod.length;

      const firstClientCount = firstPeriod.reduce((sum, d) => sum + d.totalClients, 0) / firstPeriod.length;
      const secondClientCount = secondPeriod.reduce((sum, d) => sum + d.totalClients, 0) / secondPeriod.length;

      const scoreChange = secondAvg - firstAvg;
      const scoreChangePercent = firstAvg > 0 ? (scoreChange / firstAvg) * 100 : 0;
      const clientCountChange = secondClientCount - firstClientCount;

      // Determinar tendência geral
      let overallTrend: 'improving' | 'declining' | 'stable' = 'stable';
      if (Math.abs(scoreChangePercent) > 5) {
        overallTrend = scoreChangePercent > 0 ? 'improving' : 'declining';
      }

      // Analisar mudanças por pilar
      const improvements = [];
      const concerns = [];

      const pillarChanges = {
        'Reuniões': (secondPeriod.reduce((sum, d) => sum + d.avgMeetingEngagement, 0) / secondPeriod.length) - 
                   (firstPeriod.reduce((sum, d) => sum + d.avgMeetingEngagement, 0) / firstPeriod.length),
        'App Usage': (secondPeriod.reduce((sum, d) => sum + d.avgAppUsage, 0) / secondPeriod.length) - 
                    (firstPeriod.reduce((sum, d) => sum + d.avgAppUsage, 0) / firstPeriod.length),
        'Pagamentos': (secondPeriod.reduce((sum, d) => sum + d.avgPaymentStatus, 0) / secondPeriod.length) - 
                     (firstPeriod.reduce((sum, d) => sum + d.avgPaymentStatus, 0) / firstPeriod.length),
        'Ecossistema': (secondPeriod.reduce((sum, d) => sum + d.avgEcosystemEngagement, 0) / secondPeriod.length) - 
                      (firstPeriod.reduce((sum, d) => sum + d.avgEcosystemEngagement, 0) / firstPeriod.length),
        'NPS': (secondPeriod.reduce((sum, d) => sum + d.avgNpsScore, 0) / secondPeriod.length) - 
               (firstPeriod.reduce((sum, d) => sum + d.avgNpsScore, 0) / firstPeriod.length),
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
  }
};
