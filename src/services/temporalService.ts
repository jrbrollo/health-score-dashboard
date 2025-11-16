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
function fillGapsWithForwardFill(
  data: TemporalAnalysis[],
  startDate: Date,
  endDate: Date
): TemporalAnalysis[] {
  if (!data || data.length === 0) {
    // Se não há dados, retornar array vazio (não criar dados fictícios)
    console.log('⚠️ Forward Filling: Sem dados para preencher');
    return [];
  }

  // Normalizar datas (remover horas)
  const normalizedStart = new Date(startDate);
  normalizedStart.setHours(0, 0, 0, 0);
  const normalizedEnd = new Date(endDate);
  normalizedEnd.setHours(0, 0, 0, 0);
  
  console.log(`🔄 Forward Filling: Preenchendo de ${normalizedStart.toISOString().split('T')[0]} até ${normalizedEnd.toISOString().split('T')[0]} (${data.length} registros iniciais)`);

  // Agrupar dados por planejador para aplicar forward filling separadamente
  const dataByPlanner = new Map<string | Planner, TemporalAnalysis[]>();
  data.forEach(item => {
    const plannerKey = item.planner || 'all';
    if (!dataByPlanner.has(plannerKey)) {
      dataByPlanner.set(plannerKey, []);
    }
    dataByPlanner.get(plannerKey)!.push(item);
  });

  // Aplicar forward filling para cada planejador separadamente
  const result: TemporalAnalysis[] = [];
  
  for (const [planner, plannerData] of dataByPlanner.entries()) {
    // Criar mapa de dados por data para este planejador (chave: YYYY-MM-DD)
    const dataMap = new Map<string, TemporalAnalysis>();
    plannerData.forEach(item => {
      const itemDate = new Date(item.recordedDate);
      itemDate.setHours(0, 0, 0, 0);
      const dateKey = itemDate.toISOString().split('T')[0];
      dataMap.set(dateKey, item);
    });

    // Ordenar dados existentes por data
    const sortedData = Array.from(dataMap.values()).sort(
      (a, b) => a.recordedDate.getTime() - b.recordedDate.getTime()
    );

    if (sortedData.length === 0) {
      continue; // Pular se não há dados para este planejador
    }

    // Gerar sequência completa de datas do período para este planejador
    const currentDate = new Date(normalizedStart);
    let lastKnownValue: TemporalAnalysis | null = null;

    // Encontrar o primeiro valor conhecido (pode ser antes de startDate)
    for (const item of sortedData) {
      const itemDate = new Date(item.recordedDate);
      itemDate.setHours(0, 0, 0, 0);
      
      if (itemDate <= normalizedStart) {
        lastKnownValue = item;
      } else {
        break;
      }
    }

    // Se não há valor antes de startDate, usar o primeiro disponível
    if (!lastKnownValue && sortedData.length > 0) {
      lastKnownValue = sortedData[0];
    }

    // Iterar por cada dia do período
    const plannerStartDate = new Date(normalizedStart);
    while (plannerStartDate <= normalizedEnd) {
      const dateKey = plannerStartDate.toISOString().split('T')[0];
      const existingData = dataMap.get(dateKey);

      if (existingData) {
        // Há dados reais para esta data: usar e atualizar último valor conhecido
        result.push(existingData);
        lastKnownValue = existingData;
      } else if (lastKnownValue) {
        // Não há dados: usar forward fill (último valor conhecido)
        // Criar cópia do último valor conhecido com a data atual
        result.push({
          ...lastKnownValue,
          recordedDate: new Date(plannerStartDate), // Usar data atual, não a data do último valor
        });
      }
      // Se não há lastKnownValue e não há dados, não adicionar nada (mas isso não deve acontecer)

      // Avançar para o próximo dia
      plannerStartDate.setDate(plannerStartDate.getDate() + 1);
    }
  }

  // Ordenar resultado final por data e planejador
  const sortedResult = result.sort((a, b) => {
    const dateDiff = a.recordedDate.getTime() - b.recordedDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    // Se mesma data, ordenar por planejador
    const plannerA = String(a.planner || '');
    const plannerB = String(b.planner || '');
    return plannerA.localeCompare(plannerB);
  });
  
  const expectedDays = Math.floor((normalizedEnd.getTime() - normalizedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  console.log(`✅ Forward Filling: ${sortedResult.length} registros finais (esperado: ${expectedDays} dias)`);
  
  return sortedResult;
}

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
      console.log(`📅 Aplicando Forward Filling de ${safeStartDate.toISOString().split('T')[0]} até ${safeEndDate.toISOString().split('T')[0]}`);
      // Aplicar forward filling para preencher lacunas (ex: fins de semana sem upload)
      const filledData = fillGapsWithForwardFill(rawData, safeStartDate, safeEndDate);
      console.log(`✅ Dados após Forward Filling: ${filledData.length} registros`);
      return filledData;
    } catch (error) {
      console.error('Erro no getTemporalAnalysis:', error);
      const safeStartDate = clampToMinHistoryDate(startDate);
      const safeEndDate = clampToMinHistoryDate(endDate);
      return this.calculatePlannerAnalysis(safeStartDate, safeEndDate, planner ?? 'all', hierarchyFilters);
    }
  },

  // Obter análise temporal agregada (todos os planejadores) AS-OF
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
        return this.calculateAggregatedAnalysis(safeStartDate, safeEndDate, hierarchyFilters);
      }

      const rawData = data.map((item: any) => ({
        ...databaseToTemporalAnalysis(item),
        planner: 'all' as const
      }));
      console.log(`📊 Dados agregados recebidos da RPC: ${rawData.length} registros de ${startDateStr} até ${endDateStr}`);
      console.log(`📅 Aplicando Forward Filling de ${safeStartDate.toISOString().split('T')[0]} até ${safeEndDate.toISOString().split('T')[0]}`);
      // Aplicar forward filling para preencher lacunas (ex: fins de semana sem upload)
      const filledData = fillGapsWithForwardFill(rawData, safeStartDate, safeEndDate);
      console.log(`✅ Dados agregados após Forward Filling: ${filledData.length} registros`);
      return filledData;
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
    try {
      // Garantir que datas não sejam anteriores à data mínima confiável
      const safeStartDate = clampToMinHistoryDate(startDate);
      const safeEndDate = clampToMinHistoryDate(endDate);
      
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
      // Aplicar forward filling para preencher lacunas (ex: fins de semana sem upload)
      return fillGapsWithForwardFill(sortedAggregated, safeStartDate, safeEndDate);
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
      // Aplicar forward filling para preencher lacunas (ex: fins de semana sem upload)
      return fillGapsWithForwardFill(sortedAggregated, safeStartDate, safeEndDate);
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

  // Obter histórico de um cliente específico
  async getClientHistory(clientId: string): Promise<HealthScoreHistory[]> {
    try {
      // Filtrar apenas dados a partir da data mínima confiável (13/11/2025)
      const minDateStr = MIN_HISTORY_DATE.toISOString().split('T')[0];
      
      const { data, error } = await executeQueryWithTimeout(
        () => supabase
        .from('health_score_history')
        .select('*')
        .eq('client_id', clientId)
        .gte('recorded_date', minDateStr) // Filtrar apenas a partir da data mínima
        .order('recorded_date', { ascending: true }),
        30000 // 30 segundos para histórico de um cliente
      );

      if (error) throw error;

      const history = (data || []).map(databaseToHealthScoreHistory);
      
      // Se não há histórico, tentar criar um registro APENAS se houver last_seen_at
      // IMPORTANTE: Não criar histórico para datas futuras ou sem dados importados
      if (history.length === 0) {
        console.log(`[temporalService] Cliente ${clientId} sem histórico. Verificando se pode criar automaticamente...`);
        try {
          // Buscar dados atuais do cliente para pegar a data do último snapshot
          const { data: clientData, error: clientError } = await executeQueryWithTimeout(
            () => supabase
              .from('clients')
              .select('id, last_seen_at, is_spouse, name')
              .eq('id', clientId)
              .single(),
            10000 // 10 segundos
          );
          
          if (clientError) {
            console.warn(`[temporalService] Erro ao buscar cliente ${clientId}:`, clientError);
            return history;
          }
          
          if (!clientData) {
            console.warn(`[temporalService] Cliente ${clientId} não encontrado`);
            return history;
          }
          
          // IMPORTANTE: Só criar histórico se houver last_seen_at (dados importados)
          // Não criar para datas futuras ou sem dados
          if (!clientData.last_seen_at) {
            console.log(`[temporalService] Cliente ${clientId} sem last_seen_at, não criando histórico automático`);
            return history;
          }
          
          const lastSeen = new Date(clientData.last_seen_at);
          lastSeen.setHours(0, 0, 0, 0);
          
          // Só criar se a data do snapshot for >= data mínima
          if (lastSeen < MIN_HISTORY_DATE) {
            console.warn(`[temporalService] Data do snapshot (${lastSeen.toLocaleDateString('pt-BR')}) é anterior à data mínima (${MIN_HISTORY_DATE.toLocaleDateString('pt-BR')})`);
            return history;
          }
          
          // Verificar se a data do snapshot não é futura
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (lastSeen > today) {
            console.warn(`[temporalService] Data do snapshot (${lastSeen.toLocaleDateString('pt-BR')}) é futura, não criando histórico`);
            return history;
          }
          
          // Criar histórico usando a função RPC com a data do snapshot (não data atual)
          const recordDateStr = lastSeen.toISOString().split('T')[0];
          console.log(`[temporalService] Chamando RPC record_health_score_history_v3 para cliente ${clientId} (cônjuge: ${clientData.is_spouse ? 'sim' : 'não'}) com data ${recordDateStr} (do snapshot)`);
          
          const { error: createError } = await executeQueryWithTimeout(
            () => supabase.rpc('record_health_score_history_v3', {
              p_client_id: clientId,
              p_recorded_date: recordDateStr
            }),
            10000 // 10 segundos
          );
          
          if (createError) {
            console.error(`[temporalService] Erro ao criar histórico automático para ${clientId}:`, createError);
            return history;
          }
          
          console.log(`[temporalService] Histórico criado com sucesso. Buscando novamente...`);
          
          // Buscar novamente após criar
          const { data: newData, error: newError } = await executeQueryWithTimeout(
            () => supabase
              .from('health_score_history')
              .select('*')
              .eq('client_id', clientId)
              .gte('recorded_date', minDateStr)
              .order('recorded_date', { ascending: true }),
            10000
          );
          
          if (newError) {
            console.error(`[temporalService] Erro ao buscar histórico após criação:`, newError);
            return history;
          }
          
          if (newData && newData.length > 0) {
            console.log(`[temporalService] Histórico encontrado após criação: ${newData.length} registro(s)`);
            return newData.map(databaseToHealthScoreHistory);
          } else {
            console.warn(`[temporalService] Histórico criado mas não encontrado na busca (pode ser problema de filtro de data)`);
          }
        } catch (createErr) {
          console.error(`[temporalService] Exceção ao criar histórico automático para ${clientId}:`, createErr);
        }
      }
      
      return history;
    } catch (error) {
      console.error('Erro ao buscar histórico do cliente:', error);
      return [];
    }
  }
};
