import { supabase } from '@/lib/supabase';
import { HealthScoreHistory, TemporalAnalysis, TrendAnalysis, PeriodComparison } from '@/types/temporal';
import { Planner } from '@/types/client';
import { MIN_HISTORY_DATE, clampToMinHistoryDate } from '@/lib/constants';
import { executeQueryWithTimeout } from '@/lib/queryUtils';

const round2 = (value: number) => Math.round(value * 100) / 100;
const averageFromRecords = (records: any[], selector: (record: any) => number | null | undefined) => {
  if (!records || records.length === 0) return 0;
  const sum = records.reduce((acc, record) => acc + (selector(record) ?? 0), 0);
  return sum / records.length;
};

/**
 * Preenche lacunas temporais usando Forward Filling (último valor conhecido)
 * Garante que todos os dias do período tenham dados, mesmo quando não há upload (ex: fins de semana)
 * 
 * IMPORTANTE: Aplica forward filling por planejador separadamente para garantir consistência
 * 
 * @param data Array de dados temporais com lacunas
 * @param startDate Data inicial do período
 * @param endDate Data final do período
 * @returns Array completo com todos os dias preenchidos
 */
// REMOVIDO: fillGapsWithForwardFill
// A lógica de Forward Filling foi centralizada nas funções SQL:
// - get_temporal_analysis_asof
// - get_client_health_score_evolution
// - get_sankey_snapshot
// Essas funções já aplicam Forward Filling automaticamente, então não é necessário
// fazer isso no frontend.

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
  // Obter a última data com histórico real
  async getMaxHistoryDate(): Promise<Date | null> {
    try {
      const { data, error } = await executeQueryWithTimeout(
        () => supabase
          .from('health_score_history')
          .select('recorded_date')
          .order('recorded_date', { ascending: false })
          .limit(1)
          .single(),
        10000
      );

      if (error || !data) {
        return null;
      }

      return new Date(data.recorded_date);
    } catch (error) {
      console.error('Erro ao buscar última data do histórico:', error);
      return null;
    }
  },

  // Obter análise temporal para um período específico (AS-OF)
  async getTemporalAnalysis(
    startDate: Date,
    endDate: Date,
    planner?: Planner | "all",
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[]; includeNulls?: { manager?: boolean; mediator?: boolean; leader?: boolean } }
  ): Promise<TemporalAnalysis[]> {
    try {
      // Garantir que datas não sejam anteriores à data mínima confiável
      let safeStartDate = clampToMinHistoryDate(startDate);
      let safeEndDate = clampToMinHistoryDate(endDate);
      
      // Normalizar datas (remover horas) - criar novas instâncias para não modificar as originais
      safeStartDate = new Date(safeStartDate);
      safeStartDate.setHours(0, 0, 0, 0);
      safeEndDate = new Date(safeEndDate);
      safeEndDate.setHours(0, 0, 0, 0);
      
      // Validar que start_date <= end_date
      if (safeStartDate.getTime() > safeEndDate.getTime()) {
        console.warn('⚠️ Data inicial maior que data final, invertendo...');
        const temp = new Date(safeStartDate);
        safeStartDate = new Date(safeEndDate);
        safeEndDate = temp;
      }
      
      // Validar que as datas são válidas
      if (isNaN(safeStartDate.getTime()) || isNaN(safeEndDate.getTime())) {
        console.error('❌ Datas inválidas:', { safeStartDate, safeEndDate });
        return [];
      }
      
      const startDateStr = safeStartDate.toISOString().split('T')[0];
      const endDateStr = safeEndDate.toISOString().split('T')[0];
      
      console.log(`📊 Buscando análise temporal: ${startDateStr} até ${endDateStr}`);
      
      // Tenta RPC as-of; se não existir (404), volta para view antiga
      // Garantir que arrays vazios sejam null (não [])
      const managersParam = hierarchyFilters?.managers && hierarchyFilters.managers.length > 0 
        ? hierarchyFilters.managers 
        : null;
      const mediatorsParam = hierarchyFilters?.mediators && hierarchyFilters.mediators.length > 0 
        ? hierarchyFilters.mediators 
        : null;
      const leadersParam = hierarchyFilters?.leaders && hierarchyFilters.leaders.length > 0 
        ? hierarchyFilters.leaders 
        : null;
      
      const { data, error } = await executeQueryWithTimeout(
        () => supabase.rpc('get_temporal_analysis_asof', {
          start_date: startDateStr,
          end_date: endDateStr,
          planner_filter: planner ?? 'all',
          managers: managersParam,
          mediators: mediatorsParam,
          leaders: leadersParam,
          include_null_manager: hierarchyFilters?.includeNulls?.manager ?? false,
          include_null_mediator: hierarchyFilters?.includeNulls?.mediator ?? false,
          include_null_leader: hierarchyFilters?.includeNulls?.leader ?? false,
        }),
        60000 // 60 segundos para análise temporal
      );
      
      if (error) {
        console.error('❌ Erro na chamada RPC get_temporal_analysis_asof:', error);
        console.error('Parâmetros:', {
          start_date: startDateStr,
          end_date: endDateStr,
          planner_filter: planner ?? 'all',
          managers: hierarchyFilters?.managers ?? null,
          mediators: hierarchyFilters?.mediators ?? null,
          leaders: hierarchyFilters?.leaders ?? null,
        });
      }

      if (error || !data) {
        return this.calculatePlannerAnalysis(safeStartDate, safeEndDate, planner ?? 'all', hierarchyFilters);
      }

      const rawData = data.map(databaseToTemporalAnalysis);
      console.log(`📊 Dados recebidos da RPC: ${rawData.length} registros de ${startDateStr} até ${endDateStr}`);
      // Forward Filling já é aplicado pela função SQL get_temporal_analysis_asof
      return rawData;
    } catch (error) {
      console.error('Erro no getTemporalAnalysis:', error);
      const safeStartDate = clampToMinHistoryDate(startDate);
      const safeEndDate = clampToMinHistoryDate(endDate);
      return this.calculatePlannerAnalysis(safeStartDate, safeEndDate, planner ?? 'all', hierarchyFilters);
    }
  },

  // ✅ NOVA FUNÇÃO: Obter série temporal com Forward Fill (usa get_temporal_series)
  async getTemporalSeries(
    startDate: Date,
    endDate: Date,
    plannerFilter: Planner | "all" = "all"
  ): Promise<TemporalAnalysis[]> {
    try {
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const { data, error } = await executeQueryWithTimeout(
        () => supabase.rpc('get_temporal_series', {
          start_date: startDateStr,
          end_date: endDateStr,
          planner_filter: plannerFilter === 'all' ? 'all' : plannerFilter
        }),
        60000
      );
      
      if (error) {
        console.error('Erro ao buscar série temporal:', error);
        return [];
      }
      
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data.map((item: any) => ({
        recordedDate: new Date(item.recorded_date),
        planner: item.planner || 'all',
        totalClients: item.total_clients || 0,
        avgHealthScore: item.avg_health_score || 0,
        excellentCount: 0,
        stableCount: 0,
        warningCount: 0,
        criticalCount: 0,
        avgMeetingEngagement: 0,
        avgAppUsage: 0,
        avgPaymentStatus: 0,
        avgEcosystemEngagement: 0,
        avgNpsScore: 0
      }));
    } catch (error) {
      console.error('Erro no getTemporalSeries:', error);
      return [];
    }
  },

  // ✅ NOVA FUNÇÃO: Obter score atual em tempo real (usa get_current_score)
  async getCurrentScore(
    plannerFilter: Planner | "all" = "all"
  ): Promise<{ planner: string; totalClients: number; avgHealthScore: number } | null> {
    try {
      const { data, error } = await executeQueryWithTimeout(
        () => supabase.rpc('get_current_score', {
          planner_filter: plannerFilter === 'all' ? 'all' : plannerFilter
        }),
        30000
      );
      
      if (error) {
        console.error('Erro ao buscar score atual:', error);
        return null;
      }
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        return null;
      }
      
      const result = data[0];
      return {
        planner: result.planner || 'all',
        totalClients: result.total_clients || 0,
        avgHealthScore: result.avg_health_score || 0
      };
    } catch (error) {
      console.error('Erro no getCurrentScore:', error);
      return null;
    }
  },

  // ✅ NOVA FUNÇÃO: Obter movimentos Sankey (usa get_sankey_movement)
  async getSankeyMovement(
    startDate: Date,
    endDate: Date,
    plannerFilter: Planner | "all" = "all"
  ): Promise<Array<{ fromCategory: string; toCategory: string; clientCount: number }>> {
    try {
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const { data, error } = await executeQueryWithTimeout(
        () => supabase.rpc('get_sankey_movement', {
          start_date: startDateStr,
          end_date: endDateStr,
          planner_filter: plannerFilter === 'all' ? 'all' : plannerFilter
        }),
        60000
      );
      
      if (error) {
        console.error('Erro ao buscar movimentos Sankey:', error);
        return [];
      }
      
      if (!data || !Array.isArray(data)) {
        return [];
      }
      
      return data.map((item: any) => ({
        fromCategory: item.from_category || 'Novo',
        toCategory: item.to_category || 'Perdido',
        clientCount: item.client_count || 0
      }));
    } catch (error) {
      console.error('Erro no getSankeyMovement:', error);
      return [];
    }
  },

  // Obter análise temporal agregada (todos os planejadores) AS-OF
  // ⚠️ DEPRECATED: Use getTemporalSeries em vez disso
  async getAggregatedTemporalAnalysis(
    startDate: Date,
    endDate: Date,
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[]; includeNulls?: { manager?: boolean; mediator?: boolean; leader?: boolean } }
  ): Promise<TemporalAnalysis[]> {
    try {
      // Garantir que datas não sejam anteriores à data mínima confiável
      let safeStartDate = clampToMinHistoryDate(startDate);
      let safeEndDate = clampToMinHistoryDate(endDate);
      
      // Normalizar datas (remover horas) - criar novas instâncias para não modificar as originais
      safeStartDate = new Date(safeStartDate);
      safeStartDate.setHours(0, 0, 0, 0);
      safeEndDate = new Date(safeEndDate);
      safeEndDate.setHours(0, 0, 0, 0);
      
      // Validar que start_date <= end_date
      if (safeStartDate.getTime() > safeEndDate.getTime()) {
        console.warn('⚠️ Data inicial maior que data final, invertendo...');
        const temp = new Date(safeStartDate);
        safeStartDate = new Date(safeEndDate);
        safeEndDate = temp;
      }
      
      // Validar que as datas são válidas
      if (isNaN(safeStartDate.getTime()) || isNaN(safeEndDate.getTime())) {
        console.error('❌ Datas inválidas:', { safeStartDate, safeEndDate });
        return [];
      }
      
      // Se houver filtros hierárquicos, calcular manualmente a partir do histórico
      if (hierarchyFilters && (
        (hierarchyFilters.managers && hierarchyFilters.managers.length > 0) ||
        (hierarchyFilters.mediators && hierarchyFilters.mediators.length > 0) ||
        (hierarchyFilters.leaders && hierarchyFilters.leaders.length > 0)
      )) {
        return this.calculateAggregatedAnalysis(safeStartDate, safeEndDate, hierarchyFilters);
      }
      
      const startDateStr = safeStartDate.toISOString().split('T')[0];
      const endDateStr = safeEndDate.toISOString().split('T')[0];
      
      console.log(`📊 Buscando análise temporal agregada: ${startDateStr} até ${endDateStr}`);
      
      // Garantir que arrays vazios sejam null (não [])
      const managersParam = hierarchyFilters?.managers && hierarchyFilters.managers.length > 0 
        ? hierarchyFilters.managers 
        : null;
      const mediatorsParam = hierarchyFilters?.mediators && hierarchyFilters.mediators.length > 0 
        ? hierarchyFilters.mediators 
        : null;
      const leadersParam = hierarchyFilters?.leaders && hierarchyFilters.leaders.length > 0 
        ? hierarchyFilters.leaders 
        : null;
      
      console.log(`🔍 [getAggregatedTemporalAnalysis] Chamando RPC com:`);
      console.log(`   - start_date: ${startDateStr}`);
      console.log(`   - end_date: ${endDateStr}`);
      console.log(`   - planner_filter: 'all'`);
      
      const { data, error } = await executeQueryWithTimeout(
        () => supabase.rpc('get_temporal_analysis_asof', {
          start_date: startDateStr,
          end_date: endDateStr,
          planner_filter: 'all',
          managers: managersParam,
          mediators: mediatorsParam,
          leaders: leadersParam,
          include_null_manager: hierarchyFilters?.includeNulls?.manager ?? false,
          include_null_mediator: hierarchyFilters?.includeNulls?.mediator ?? false,
          include_null_leader: hierarchyFilters?.includeNulls?.leader ?? false,
        }),
        60000 // 60 segundos para análise temporal agregada
      );
      
      console.log(`🔍 [getAggregatedTemporalAnalysis] Resposta da RPC:`);
      console.log(`   - error:`, error);
      console.log(`   - data:`, data ? `${Array.isArray(data) ? data.length : 'não é array'} registros` : 'null/undefined');
      
      // LOG DETALHADO: Mostrar conteúdo completo do array data recebido da RPC
      if (data && Array.isArray(data)) {
        console.log(`═══════════════════════════════════════════════════════════`);
        console.log(`📊 [getAggregatedTemporalAnalysis] CONTEÚDO COMPLETO DO ARRAY DATA RECEBIDO DA RPC`);
        console.log(`═══════════════════════════════════════════════════════════`);
        console.log(`   Total de registros: ${data.length}`);
        console.log(`   Período solicitado: ${startDateStr} até ${endDateStr}`);
        console.log(``);
        data.forEach((item: any, index: number) => {
          console.log(`   [${index}] Registro completo:`);
          console.log(`      - recorded_date: ${item.recorded_date}`);
          console.log(`      - planner: ${item.planner}`);
          console.log(`      - total_clients: ${item.total_clients}`);
          console.log(`      - avg_health_score: ${item.avg_health_score} ⚠️ VERIFICAR ESTE VALOR`);
          console.log(`      - excellent_count: ${item.excellent_count}`);
          console.log(`      - stable_count: ${item.stable_count}`);
          console.log(`      - warning_count: ${item.warning_count}`);
          console.log(`      - critical_count: ${item.critical_count}`);
          if (item.avg_meeting_engagement !== undefined) {
            console.log(`      - avg_meeting_engagement: ${item.avg_meeting_engagement}`);
          }
          if (item.avg_app_usage !== undefined) {
            console.log(`      - avg_app_usage: ${item.avg_app_usage}`);
          }
          if (item.avg_payment_status !== undefined) {
            console.log(`      - avg_payment_status: ${item.avg_payment_status}`);
          }
          if (item.avg_ecosystem_engagement !== undefined) {
            console.log(`      - avg_ecosystem_engagement: ${item.avg_ecosystem_engagement}`);
          }
          if (item.avg_nps_score !== undefined) {
            console.log(`      - avg_nps_score: ${item.avg_nps_score}`);
          }
          console.log(``);
        });
        console.log(`═══════════════════════════════════════════════════════════`);
      } else {
        console.log(`   ⚠️ [getAggregatedTemporalAnalysis] data não é um array válido:`, data);
      }
      
      if (error) {
        console.error('❌ Erro na chamada RPC get_temporal_analysis_asof (agregada):', error);
        console.error('Parâmetros:', {
          start_date: startDateStr,
          end_date: endDateStr,
          planner_filter: 'all',
          managers: hierarchyFilters?.managers ?? null,
          mediators: hierarchyFilters?.mediators ?? null,
          leaders: hierarchyFilters?.leaders ?? null,
        });
      }

      if (error || !data) {
        console.log(`⚠️ [getAggregatedTemporalAnalysis] RPC retornou erro ou dados vazios, usando fallback calculateAggregatedAnalysis`);
        return this.calculateAggregatedAnalysis(safeStartDate, safeEndDate, hierarchyFilters);
      }

      console.log(`✅ [getAggregatedTemporalAnalysis] RPC retornou ${data.length} registros, processando...`);
      
      const rawData = data.map((item: any) => ({
        ...databaseToTemporalAnalysis(item),
        planner: 'all' as const
      }));
      
      // LOG DETALHADO: Mostrar conteúdo completo após conversão
      console.log(`═══════════════════════════════════════════════════════════`);
      console.log(`📊 [getAggregatedTemporalAnalysis] DADOS APÓS CONVERSÃO (databaseToTemporalAnalysis)`);
      console.log(`═══════════════════════════════════════════════════════════`);
      console.log(`   Total de registros: ${rawData.length} de ${startDateStr} até ${endDateStr}`);
      console.log(``);
      rawData.forEach((item: TemporalAnalysis, index: number) => {
        const dateStr = item.recordedDate instanceof Date 
          ? item.recordedDate.toISOString().split('T')[0] 
          : String(item.recordedDate);
        console.log(`   [${index}] Registro após conversão:`);
        console.log(`      - recordedDate: ${dateStr}`);
        console.log(`      - planner: ${item.planner}`);
        console.log(`      - totalClients: ${item.totalClients}`);
        console.log(`      - avgHealthScore: ${item.avgHealthScore} ⚠️ VERIFICAR ESTE VALOR`);
        console.log(`      - excellentCount: ${item.excellentCount}`);
        console.log(`      - stableCount: ${item.stableCount}`);
        console.log(`      - warningCount: ${item.warningCount}`);
        console.log(`      - criticalCount: ${item.criticalCount}`);
        console.log(``);
      });
      console.log(`═══════════════════════════════════════════════════════════`);
      // Forward Filling já é aplicado pela função SQL get_temporal_analysis_asof
      return rawData;
    } catch (error) {
      console.error('Erro no getAggregatedTemporalAnalysis:', error);
      // Fallback: agregar manualmente
      const safeStartDate = clampToMinHistoryDate(startDate);
      const safeEndDate = clampToMinHistoryDate(endDate);
      return this.calculateAggregatedAnalysis(safeStartDate, safeEndDate);
    }
  },

  // Calcular análise agregada manualmente (fallback)
  async calculateAggregatedAnalysis(
    startDate: Date,
    endDate: Date,
    hierarchyFilters?: { managers?: string[]; mediators?: string[]; leaders?: string[]; includeNulls?: { manager?: boolean; mediator?: boolean; leader?: boolean } }
  ): Promise<TemporalAnalysis[]> {
    console.log(`🔄 [calculateAggregatedAnalysis] Método de fallback chamado`);
    console.log(`   - startDate recebido: ${startDate.toISOString().split('T')[0]}`);
    console.log(`   - endDate recebido: ${endDate.toISOString().split('T')[0]}`);
    try {
      // Garantir que datas não sejam anteriores à data mínima confiável
      const safeStartDate = clampToMinHistoryDate(startDate);
      const safeEndDate = clampToMinHistoryDate(endDate);
      console.log(`   - safeStartDate: ${safeStartDate.toISOString().split('T')[0]}`);
      console.log(`   - safeEndDate: ${safeEndDate.toISOString().split('T')[0]}`);
      
      // Buscar dados com paginação para evitar timeout
      let allData: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await executeQueryWithTimeout(
          () => supabase
          .from('health_score_history')
          .select('*')
            .gte('recorded_date', safeStartDate.toISOString().split('T')[0])
            .lte('recorded_date', safeEndDate.toISOString().split('T')[0])
          .neq('planner', '0')
          .neq('client_name', '0')
          .range(offset, offset + pageSize - 1)
            .order('recorded_date', { ascending: true }),
          60000 // 60 segundos para queries paginadas
        );

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

      const sortedAggregated = aggregated.sort((a, b) => a.recordedDate.getTime() - b.recordedDate.getTime());
      console.log(`📊 [calculateAggregatedAnalysis] Dados agregados: ${sortedAggregated.length} registros`);
      // NOTA: Forward Filling não é aplicado aqui pois esta é uma função de fallback.
      // O método principal getAggregatedTemporalAnalysis usa a função SQL que já aplica Forward Filling.
      return sortedAggregated;
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
    // Garantir que datas não sejam anteriores à data mínima confiável
    const safeStartDate = clampToMinHistoryDate(startDate);
    const safeEndDate = clampToMinHistoryDate(endDate);
    
    if (!planner || planner === 'all') {
      return this.calculateAggregatedAnalysis(safeStartDate, safeEndDate, hierarchyFilters);
    }

    try {
      // Buscar dados com paginação para evitar timeout
      let allData: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await executeQueryWithTimeout(
          () => supabase
          .from('health_score_history')
          .select('*')
          .eq('planner', planner)
            .gte('recorded_date', safeStartDate.toISOString().split('T')[0])
            .lte('recorded_date', safeEndDate.toISOString().split('T')[0])
          .range(offset, offset + pageSize - 1)
            .order('recorded_date', { ascending: true }),
          60000 // 60 segundos para queries paginadas
        );
        
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

      const sortedAggregated = aggregated.sort((a, b) => a.recordedDate.getTime() - b.recordedDate.getTime());
      // NOTA: Forward Filling não é aplicado aqui pois esta é uma função de fallback.
      // O método principal getTemporalAnalysis usa a função SQL que já aplica Forward Filling.
      return sortedAggregated;
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
      
      // ✅ CORREÇÃO: Se prior está vazio, usar os primeiros windowSize dias como fallback
      // Isso garante que sempre temos dados para comparação
      const effectivePrior = prior.length > 0 ? prior : currentData.slice(0, Math.min(windowSize, currentData.length));

      // Médias ponderadas por totalClients
      const weightedAvg = (arr: typeof currentData, selector: (d: any) => number) => {
        const totalWeight = arr.reduce((w, d) => w + (d.totalClients || 0), 0);
        if (totalWeight === 0) return 0;
        const weightedSum = arr.reduce((sum, d) => sum + selector(d) * (d.totalClients || 0), 0);
        return weightedSum / totalWeight;
      };

      const avgRecent = weightedAvg(recent, d => d.avgHealthScore);
      const avgPrior = weightedAvg(effectivePrior, d => d.avgHealthScore);

      const clientRecent = Math.round(recent.reduce((s, d) => s + d.totalClients, 0) / Math.max(1, recent.length));
      const clientPrior = Math.round(effectivePrior.reduce((s, d) => s + d.totalClients, 0) / Math.max(1, effectivePrior.length));

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
      const { data, error } = await executeQueryWithTimeout(
        () => supabase.rpc('backfill_health_score_history'),
        120000 // 120 segundos para backfill (pode demorar muito)
      );

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
      const { data, error } = await executeQueryWithTimeout(
        () => supabase
        .from('temporal_health_analysis')
        .select('planner, avg_health_score')
        .order('recorded_date', { ascending: false })
          .limit(20), // Últimos registros
        30000 // 30 segundos para query simples
      );

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

  // Obter histórico de um cliente específico (CORRIGIDO - usa função SQL get_client_health_score_evolution com Forward Filling)
  // CORREÇÃO CRÍTICA: Agora usa a mesma lógica temporal corrigida com Forward Filling automático
  async getClientHistory(clientId: string): Promise<HealthScoreHistory[]> {
    try {
      console.log(`🔍 [getClientHistory] Buscando evolução do cliente ${clientId} usando get_client_health_score_evolution...`);
      
      // Chamar função SQL get_client_health_score_evolution que aplica Forward Filling automaticamente
      const { data, error } = await executeQueryWithTimeout(
        async () => {
          const result = await (supabase as any).rpc('get_client_health_score_evolution', {
            p_client_id: clientId
          });
          return result as { data: any[] | null; error: any };
        },
        30000 // 30 segundos para histórico de um cliente
      );

      if (error) {
        console.error(`❌ Erro ao buscar evolução do cliente via get_client_health_score_evolution:`, error);
        throw error;
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`⚠️ get_client_health_score_evolution retornou dados inválidos:`, data);
        return [];
      }

      console.log(`✅ get_client_health_score_evolution retornou ${data.length} registros (com Forward Filling aplicado)`);

      // Converter resultados para HealthScoreHistory
      const history = data.map((record: any) => {
        return databaseToHealthScoreHistory({
          id: '',
          client_id: clientId, // Usar clientId do parâmetro (a função SQL não retorna client_id)
          recorded_date: record.recorded_date,
          client_name: record.client_name,
          planner: record.planner,
          health_score: record.health_score,
          health_category: record.health_category,
          nps_score_v3_pillar: record.nps_score_v3_pillar ?? 0,
          referral_pillar: record.referral_pillar ?? 0,
          payment_pillar: record.payment_pillar ?? 0,
          cross_sell_pillar: record.cross_sell_pillar ?? 0,
          tenure_pillar: record.tenure_pillar ?? 0,
          meeting_engagement: 0,
          app_usage: 0,
          payment_status: 0,
          ecosystem_engagement: 0,
          nps_score: 0,
          last_meeting: 'Nunca',
          has_scheduled_meeting: false,
          app_usage_status: 'Nunca usou',
          payment_status_detail: 'Em dia',
          has_referrals: false,
          nps_score_detail: 'Não avaliado',
          ecosystem_usage: 'Não usa',
          created_at: record.created_at || new Date().toISOString()
        });
      });

      // Filtrar novamente no frontend para garantir (já filtrado no backend, mas garantia extra)
      const filteredHistory = history.filter(h => {
        const recordDate = new Date(h.recordedDate);
        recordDate.setHours(0, 0, 0, 0);
        return recordDate >= MIN_HISTORY_DATE;
      });

      console.log(`✅ Histórico processado: ${filteredHistory.length} registros (após filtro MIN_HISTORY_DATE)`);
      
      return filteredHistory;
    } catch (error) {
      console.error('Erro ao buscar histórico do cliente:', error);
      return [];
    }
  }
};
