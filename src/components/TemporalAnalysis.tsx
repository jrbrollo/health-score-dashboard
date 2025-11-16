import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { TrendingUp, TrendingDown, Minus, BarChart3, LineChart, PieChart } from 'lucide-react';
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from 'recharts';
import { temporalService } from '@/services/temporalService';
import { TemporalAnalysis, TrendAnalysis, Planner } from '@/types/temporal';
import { format, subDays, startOfDay, endOfDay, differenceInCalendarDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Client } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';
import { AnalysisInfoTooltip } from './AnalysisInfoTooltip';
import { MIN_HISTORY_DATE, clampToMinHistoryDate } from '@/lib/constants';

interface TemporalAnalysisProps {
  isDarkMode?: boolean;
  selectedPlanner?: string | null;
  selectedManager?: string | "all";
  selectedMediator?: string | "all";
  selectedLeader?: string | "all";
  currentClientCount?: number;
  filteredClients?: Client[];
}

const DEFAULT_DAYS = 30;
const QUICK_RANGES = [
  { label: '30 dias', value: 30 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
];

const TemporalAnalysisComponent: React.FC<TemporalAnalysisProps> = ({
  isDarkMode = false,
  selectedPlanner = null,
  selectedManager = 'all',
  selectedMediator = 'all',
  selectedLeader = 'all',
  currentClientCount = 0,
  filteredClients = [],
}) => {
  const [analysisData, setAnalysisData] = useState<TemporalAnalysis[]>([]);
  const [trendData, setTrendData] = useState<TrendAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxHistoryDate, setMaxHistoryDate] = useState<Date | null>(null);
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = startOfDay(subDays(today, DEFAULT_DAYS));
    // Garantir que data inicial não seja anterior à data mínima confiável
    const safeFromDate = clampToMinHistoryDate(fromDate);
    return {
      from: safeFromDate,
      to: today // Será ajustado quando maxHistoryDate for carregado
    };
  });
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('line');
  const [viewMode, setViewMode] = useState<'score' | 'distribution' | 'pillars'>('score');

  const periodLength = useMemo(() => {
    return Math.max(0, differenceInCalendarDays(dateRange.to, dateRange.from));
  }, [dateRange]);

  const activeQuickRange = useMemo(() => {
    const match = QUICK_RANGES.find(range => range.value === periodLength);
    return match?.value ?? null;
  }, [periodLength]);

  const handleQuickRange = (days: number) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = startOfDay(subDays(today, days));
    // Garantir que data inicial não seja anterior à data mínima confiável
    const safeFromDate = clampToMinHistoryDate(fromDate);
    setDateRange({
      from: safeFromDate,
      to: today // Usar data atual para permitir Forward Filling até hoje (incluindo fins de semana)
    });
  };

  const handleDateChange = (range: { from?: Date; to?: Date }) => {
    if (!range?.from) {
      console.warn('⚠️ handleDateChange chamado sem data inicial');
      return;
    }
    
    // Validar que a data inicial é válida
    if (isNaN(range.from.getTime())) {
      console.error('❌ Data inicial inválida:', range.from);
      return;
    }
    
    const from = startOfDay(range.from);
    // Garantir que data não seja anterior à data mínima confiável
    const safeFrom = clampToMinHistoryDate(from);
    
    // Permitir seleção de datas futuras - a validação será feita na busca de dados
    let to: Date;
    if (range?.to) {
      // Validar que a data final é válida
      if (isNaN(range.to.getTime())) {
        console.error('❌ Data final inválida:', range.to);
        to = startOfDay(safeFrom);
      } else {
        to = startOfDay(range.to);
      }
    } else {
      to = startOfDay(safeFrom);
    }
    
    // Garantir que from <= to
    if (safeFrom.getTime() > to.getTime()) {
      console.warn('⚠️ Data inicial maior que data final, ajustando...');
      to = new Date(safeFrom);
    }
    
    // Verificar se as datas realmente mudaram para evitar atualizações desnecessárias
    const currentFrom = dateRange.from.getTime();
    const currentTo = dateRange.to.getTime();
    const newFrom = safeFrom.getTime();
    const newTo = to.getTime();
    
    if (currentFrom === newFrom && currentTo === newTo) {
      console.log('📅 Período não mudou, ignorando atualização');
      return;
    }
    
    console.log(`📅 Atualizando período: ${format(safeFrom, 'dd/MM/yyyy')} até ${format(to, 'dd/MM/yyyy')}`);
    setDateRange({ from: safeFrom, to });
  };

  // Cores para os gráficos
  const colors = {
    excellent: isDarkMode ? '#10b981' : '#059669',
    stable: isDarkMode ? '#3b82f6' : '#2563eb',
    warning: isDarkMode ? '#f59e0b' : '#d97706',
    critical: isDarkMode ? '#ef4444' : '#dc2626',
    score: isDarkMode ? '#8b5cf6' : '#7c3aed',
    payment: isDarkMode ? '#f97316' : '#ea580c',
    ecosystem: isDarkMode ? '#ec4899' : '#db2777',
    nps: isDarkMode ? '#6366f1' : '#4f46e5'
  };

  // Carregar última data com histórico (apenas para informação, não limita seleção)
  useEffect(() => {
    const loadMaxHistoryDate = async () => {
      const maxDate = await temporalService.getMaxHistoryDate();
      if (maxDate) {
        setMaxHistoryDate(maxDate);
        // Não ajustar automaticamente a data final - permitir seleção de datas futuras
        // A validação será feita na busca de dados
      }
    };
    loadMaxHistoryDate();
  }, []);

  // Carregar dados
  useEffect(() => {
    loadAnalysisData();
  }, [selectedPlanner, selectedManager, selectedMediator, selectedLeader, dateRange.from, dateRange.to]);

  // Carregar análise de tendência
  useEffect(() => {
    loadTrendAnalysis();
  }, [selectedPlanner, selectedManager, selectedMediator, selectedLeader, dateRange.from, dateRange.to]);

  const loadAnalysisData = async () => {
    setLoading(true);
    try {
      // Validar que as datas são válidas antes de fazer a chamada
      if (!dateRange.from || !dateRange.to || isNaN(dateRange.from.getTime()) || isNaN(dateRange.to.getTime())) {
        console.error('❌ Datas inválidas no dateRange:', dateRange);
        setAnalysisData([]);
        setLoading(false);
        return;
      }
      
      // Validar que from <= to
      if (dateRange.from.getTime() > dateRange.to.getTime()) {
        console.error('❌ Data inicial maior que data final:', {
          from: format(dateRange.from, 'dd/MM/yyyy'),
          to: format(dateRange.to, 'dd/MM/yyyy')
        });
        setAnalysisData([]);
        setLoading(false);
        return;
      }
      
      const managerFilter = selectedManager !== 'all' ? [selectedManager] : undefined;
      const mediatorFilter = selectedMediator !== 'all' ? [selectedMediator] : undefined;
      const leaderFilter = selectedLeader !== 'all' ? [selectedLeader] : undefined;

      const hierarchyFilters = managerFilter || mediatorFilter || leaderFilter
        ? {
            managers: managerFilter,
            mediators: mediatorFilter,
            leaders: leaderFilter,
          }
        : undefined;

      // Timeout de segurança: 90 segundos (aumentado de 30s para dar margem ao RPC que pode demorar até 60s)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout ao carregar análise temporal')), 90000);
      });

      const dataPromise = !selectedPlanner
        ? temporalService.getAggregatedTemporalAnalysis(dateRange.from, dateRange.to, hierarchyFilters)
        : temporalService.getTemporalAnalysis(dateRange.from, dateRange.to, selectedPlanner as Planner, hierarchyFilters);

      const data = await Promise.race([dataPromise, timeoutPromise]);
      
      setAnalysisData(data);
    } catch (error: any) {
      console.error('❌ Erro ao carregar dados temporais:', error);
      console.error('Parâmetros da chamada:', {
        from: dateRange.from ? format(dateRange.from, 'dd/MM/yyyy') : 'inválido',
        to: dateRange.to ? format(dateRange.to, 'dd/MM/yyyy') : 'inválido',
        planner: selectedPlanner,
        manager: selectedManager,
        mediator: selectedMediator,
        leader: selectedLeader
      });
      // Em caso de erro ou timeout, definir dados vazios para não travar a aplicação
      setAnalysisData([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTrendAnalysis = async () => {
    try {
      // Calcular o número de dias do período selecionado
      const daysDiff = Math.max(1, periodLength);
      const managerFilter = selectedManager !== 'all' ? [selectedManager] : undefined;
      const mediatorFilter = selectedMediator !== 'all' ? [selectedMediator] : undefined;
      const leaderFilter = selectedLeader !== 'all' ? [selectedLeader] : undefined;

      const trend = await temporalService.getTrendAnalysis(
        (selectedPlanner as Planner | null) ?? 'all',
        daysDiff,
        dateRange.from,
        dateRange.to,
        managerFilter || mediatorFilter || leaderFilter
          ? {
              managers: managerFilter,
              mediators: mediatorFilter,
              leaders: leaderFilter,
            }
          : undefined
      );
      setTrendData(trend);
    } catch (error) {
      console.error('Erro ao carregar análise de tendência:', error);
    }
  };

  // Calcular score atual em tempo real dos clientes filtrados
  const currentScore = useMemo(() => {
    if (!filteredClients || filteredClients.length === 0) {
      return 0;
    }
    
    // Calcular média em tempo real dos clientes filtrados
    const scores = filteredClients
      .filter(client => client.isActive !== false)
      .map(client => calculateHealthScore(client));
    
    if (scores.length === 0) return 0;
    
    const sum = scores.reduce((acc, score) => acc + score.score, 0);
    return sum / scores.length;
  }, [filteredClients]);

  // Preparar dados para gráficos - dados históricos com último ponto atualizado
  const prepareChartData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    console.log(`📊 [prepareChartData] Recebidos ${analysisData.length} registros de analysisData`);
    if (analysisData.length > 0) {
      const datesInAnalysis = analysisData.map(item => {
        const itemDate = new Date(item.recordedDate);
        itemDate.setHours(0, 0, 0, 0);
        return itemDate.toISOString().split('T')[0];
      }).sort();
      console.log(`📋 [prepareChartData] Datas em analysisData: ${datesInAnalysis.join(', ')}`);
    }
    
    // Filtrar apenas dados históricos válidos (não futuros)
    const historicalData = analysisData
      .filter(item => {
        const itemDate = new Date(item.recordedDate);
        itemDate.setHours(0, 0, 0, 0);
        // Não incluir datas futuras
        const isValid = itemDate.getTime() <= today.getTime();
        if (!isValid) {
          console.log(`⚠️ [prepareChartData] Filtrando data futura: ${itemDate.toISOString().split('T')[0]}`);
        }
        return isValid;
      })
      .map(item => ({
        date: format(item.recordedDate, 'dd/MM', { locale: ptBR }),
        fullDate: item.recordedDate,
        avgScore: item.avgHealthScore,
        totalClients: item.totalClients,
        excellent: item.excellentCount,
        stable: item.stableCount,
        warning: item.warningCount,
        critical: item.criticalCount,
        payment: item.avgPaymentStatus,
        ecosystem: item.avgEcosystemEngagement,
        nps: item.avgNpsScore
      }));

    // Ordenar por data e remover duplicatas (manter apenas o mais recente de cada data)
    const uniqueByDate = new Map<string, typeof historicalData[0]>();
    
    historicalData.forEach(item => {
      const dateKey = format(item.fullDate, 'yyyy-MM-dd');
      const existing = uniqueByDate.get(dateKey);
      
      // Se não existe ou se este é mais recente, substituir
      if (!existing || item.fullDate.getTime() > existing.fullDate.getTime()) {
        uniqueByDate.set(dateKey, item);
      }
    });

    const sortedData = Array.from(uniqueByDate.values()).sort((a, b) => a.fullDate.getTime() - b.fullDate.getTime());
    
    console.log(`📊 [prepareChartData] Após filtros e deduplicação: ${sortedData.length} registros`);
    if (sortedData.length > 0) {
      const datesInChart = sortedData.map(item => format(item.fullDate, 'yyyy-MM-dd')).sort();
      console.log(`📋 [prepareChartData] Datas que serão exibidas no gráfico: ${datesInChart.join(', ')}`);
    }
    
    // Se houver dados e o último ponto for do dia mais recente, atualizar com score atual
    if (sortedData.length > 0 && filteredClients && filteredClients.length > 0 && currentScore > 0) {
      const lastPoint = sortedData[sortedData.length - 1];
      const lastPointDate = new Date(lastPoint.fullDate);
      lastPointDate.setHours(0, 0, 0, 0);
      
      // Se o último ponto for de hoje ou do último dia disponível, atualizar com score atual
      const daysDiff = Math.floor((today.getTime() - lastPointDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Atualizar se for hoje (0 dias) ou ontem (1 dia) - para garantir que sempre mostre o valor mais atual
      if (daysDiff <= 1) {
        // Calcular contagens atualizadas
        const scores = filteredClients
          .filter(client => client.isActive !== false)
          .map(client => calculateHealthScore(client));
        
        const excellent = scores.filter(s => s.category === "Ótimo").length;
        const stable = scores.filter(s => s.category === "Estável").length;
        const warning = scores.filter(s => s.category === "Atenção").length;
        const critical = scores.filter(s => s.category === "Crítico").length;
        
        // Substituir o último ponto com dados atualizados
        sortedData[sortedData.length - 1] = {
          ...lastPoint,
          avgScore: currentScore,
          totalClients: filteredClients.filter(c => c.isActive !== false).length,
          excellent,
          stable,
          warning,
          critical,
        };
      }
    }

    return sortedData;
  }, [analysisData, filteredClients, currentScore]);

  const chartData = prepareChartData;

  // Renderizar gráfico baseado no tipo e modo
  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <p className="text-gray-500">Carregando dados...</p>
          </div>
        </div>
      );
    }

    if (!loading && chartData.length === 0) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-gray-500">Sem dados no período selecionado.</p>
          </div>
        </div>
      );
    }

    // ========== DEBUG: Dados Finais para Gráfico ==========
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`[Render Debug] Dados Finais para Gráfico (${chartData.length} pontos)`);
    console.log('═══════════════════════════════════════════════════════════');
    
    // Mostrar todos os dados com foco nos últimos pontos
    if (chartData.length > 0) {
      // Mostrar primeiros 3 pontos
      if (chartData.length > 3) {
        console.log('📊 Primeiros 3 pontos:');
        chartData.slice(0, 3).forEach((item, idx) => {
          const dateStr = format(item.fullDate, 'yyyy-MM-dd');
          console.log(`   [${idx}] ${dateStr} - Score: ${item.avgScore}, Clientes: ${item.totalClients}`);
        });
        console.log('   ...');
      }
      
      // Mostrar últimos 5 pontos (onde devem estar 15/11 e 16/11)
      // CORREÇÃO: Normalizar data antes de formatar para lidar com timezone
      const normalizeDateForComparison = (date: Date): string => {
        const normalized = new Date(date);
        normalized.setHours(0, 0, 0, 0);
        return normalized.toISOString().split('T')[0];
      };
      
      const lastPoints = chartData.slice(-5);
      console.log('📊 Últimos 5 pontos (onde devem estar 15/11 e 16/11):');
      lastPoints.forEach((item, idx) => {
        const dateStr = normalizeDateForComparison(item.fullDate);
        const isTargetDate = dateStr === '2025-11-15' || dateStr === '2025-11-16';
        const marker = isTargetDate ? '🎯' : '   ';
        console.log(`${marker} [${chartData.length - lastPoints.length + idx}] ${dateStr} - Score: ${item.avgScore}, Clientes: ${item.totalClients}`);
      });
      
      // Verificar especificamente se 15/11 e 16/11 estão presentes
      // Usar a função normalizeDateForComparison já definida acima
      const hasNov15 = chartData.some(item => {
        const normalized = normalizeDateForComparison(item.fullDate);
        return normalized === '2025-11-15';
      });
      const hasNov16 = chartData.some(item => {
        const normalized = normalizeDateForComparison(item.fullDate);
        return normalized === '2025-11-16';
      });
      
      console.log('\n🔍 Verificação Específica (com normalização de timezone):');
      console.log(`   ✅ 15/11/2025 presente: ${hasNov15 ? 'SIM' : 'NÃO'}`);
      console.log(`   ✅ 16/11/2025 presente: ${hasNov16 ? 'SIM' : 'NÃO'}`);
      
      if (!hasNov15 || !hasNov16) {
        console.log('   ⚠️ PROBLEMA IDENTIFICADO: Datas 15/11 ou 16/11 estão faltando no array final!');
        console.log('   📋 Todas as datas no array (com normalização):');
        chartData.forEach((item, idx) => {
          const dateStr = normalizeDateForComparison(item.fullDate);
          const rawDate = item.fullDate.toISOString();
          console.log(`      [${idx}] ${dateStr} (raw: ${rawDate})`);
        });
      } else {
        console.log('   ✅ Todas as datas esperadas estão presentes no array final!');
      }
    } else {
      console.log('⚠️ Array chartData está vazio!');
    }
    
    console.log('═══════════════════════════════════════════════════════════\n');
    // ========== FIM DEBUG ==========

    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    if (viewMode === 'score') {
      const ChartComponent = chartType === 'line' ? RechartsLineChart : 
                           chartType === 'area' ? AreaChart : BarChart;
      
      return (
        <ResponsiveContainer width="100%" height={300}>
          <ChartComponent {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
            <XAxis 
              dataKey="fullDate" 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
              tickFormatter={(date) => {
                // Garantir que date seja um objeto Date válido
                const dateObj = date instanceof Date ? date : new Date(date);
                return format(dateObj, 'dd/MM', { locale: ptBR });
              }}
            />
            <YAxis 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
              domain={['dataMin - 5', 'dataMax + 5']}
              tickCount={8}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                borderRadius: '8px',
                color: isDarkMode ? '#f9fafb' : '#111827'
              }}
              formatter={(value: any) => {
                const formattedValue = typeof value === 'number' ? value.toFixed(2) : value || 0;
                return [`${formattedValue}`, 'Score Médio'];
              }}
              labelFormatter={(label) => {
                // Formatar label corretamente se for Date
                const dateObj = label instanceof Date ? label : new Date(label);
                return `Data: ${format(dateObj, 'dd/MM/yyyy', { locale: ptBR })}`;
              }}
            />
            {chartType === 'area' ? (
              <Area
                type="monotone"
                dataKey="avgScore"
                stroke={colors.score}
                fill={colors.score}
                fillOpacity={0.3}
                strokeWidth={2}
                name="Score Médio"
              />
            ) : chartType === 'line' ? (
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke={colors.score}
                strokeWidth={3}
                dot={{ fill: colors.score, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: colors.score, strokeWidth: 2 }}
                name="Score Médio"
              />
            ) : (
              <Bar dataKey="avgScore" fill={colors.score} name="Health Score" />
            )}
          </ChartComponent>
        </ResponsiveContainer>
      );
    }

    if (viewMode === 'distribution') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
            <XAxis 
              dataKey="fullDate" 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
              tickFormatter={(date) => {
                // Garantir que date seja um objeto Date válido
                const dateObj = date instanceof Date ? date : new Date(date);
                return format(dateObj, 'dd/MM', { locale: ptBR });
              }}
            />
            <YAxis 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                borderRadius: '8px',
                color: isDarkMode ? '#f9fafb' : '#111827'
              }}
              formatter={(value: any, name: string) => {
                const labels: Record<string, string> = {
                  excellent: 'Ótimo',
                  stable: 'Estável',
                  warning: 'Atenção',
                  critical: 'Crítico'
                };
                return [`${value}`, labels[name] || name];
              }}
              labelFormatter={(label) => {
                // Formatar label corretamente se for Date
                const dateObj = label instanceof Date ? label : new Date(label);
                return `Data: ${format(dateObj, 'dd/MM/yyyy', { locale: ptBR })}`;
              }}
            />
            <Area type="monotone" dataKey="excellent" stackId="1" stroke={colors.excellent} fill={colors.excellent} name="Ótimo" />
            <Area type="monotone" dataKey="stable" stackId="1" stroke={colors.stable} fill={colors.stable} name="Estável" />
            <Area type="monotone" dataKey="warning" stackId="1" stroke={colors.warning} fill={colors.warning} name="Atenção" />
            <Area type="monotone" dataKey="critical" stackId="1" stroke={colors.critical} fill={colors.critical} name="Crítico" />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (viewMode === 'pillars') {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <RechartsLineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
            <XAxis 
              dataKey="fullDate" 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
              tickFormatter={(date) => {
                // Garantir que date seja um objeto Date válido
                const dateObj = date instanceof Date ? date : new Date(date);
                return format(dateObj, 'dd/MM', { locale: ptBR });
              }}
            />
            <YAxis 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                borderRadius: '8px',
                color: isDarkMode ? '#f9fafb' : '#111827'
              }}
              labelFormatter={(label) => {
                // Formatar label corretamente se for Date
                const dateObj = label instanceof Date ? label : new Date(label);
                return `Data: ${format(dateObj, 'dd/MM/yyyy', { locale: ptBR })}`;
              }}
            />
            <Line type="monotone" dataKey="payment" stroke={colors.payment} strokeWidth={2} name="Pagamentos" />
            <Line type="monotone" dataKey="ecosystem" stroke={colors.ecosystem} strokeWidth={2} name="Ecossistema" />
            <Line type="monotone" dataKey="nps" stroke={colors.nps} strokeWidth={2} name="NPS" />
          </RechartsLineChart>
        </ResponsiveContainer>
      );
    }

    return null;
  };

  // Renderizar ícone de tendência
  const renderTrendIcon = (trend: 'improving' | 'declining' | 'stable') => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'declining':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className={`space-y-6 ${isDarkMode ? 'gradient-bg-dark' : 'gradient-bg-light'}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">Análise Temporal</h2>
          <AnalysisInfoTooltip
            title="Análise Temporal"
            description="Esta seção permite acompanhar a evolução do Health Score ao longo do tempo, identificando tendências, padrões sazonais e mudanças na saúde da carteira."
            tips={[
              "Use o gráfico de evolução para identificar tendências de melhoria ou declínio",
              "Compare períodos diferentes usando os filtros de data (30, 60, 90 dias)",
              "Preste atenção a quedas bruscas no score que podem indicar problemas",
              "O Score Atual mostra o valor mais recente calculado em tempo real",
              "Use a análise de tendência para entender se a carteira está melhorando ou piorando"
            ]}
          />
        </div>
      </div>

      {/* Filtros */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_RANGES.map(range => (
              <Button
                key={range.value}
                variant={activeQuickRange === range.value ? 'default' : 'outline'}
                onClick={() => handleQuickRange(range.value)}
              >
                Últimos {range.label}
              </Button>
            ))}
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Período
              </label>
              <DatePickerWithRange
                date={dateRange}
                onDateChange={handleDateChange}
                className={isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}
                minDate={MIN_HISTORY_DATE}
                // Não limitar maxDate - permitir seleção de datas futuras
                // A validação será feita na busca de dados
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Tipo de Gráfico
              </label>
              <Select value={chartType} onValueChange={(value) => setChartType(value as 'line' | 'area' | 'bar')}>
                <SelectTrigger className={isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="line">Linha</SelectItem>
                  <SelectItem value="area">Área</SelectItem>
                  <SelectItem value="bar">Barras</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Visualização
              </label>
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as 'score' | 'distribution' | 'pillars')}>
                <SelectTrigger className={isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Score Médio</SelectItem>
                  <SelectItem value="distribution">Distribuição</SelectItem>
                  <SelectItem value="pillars">Pilares</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
            <p>
              <span className="font-medium">Planejador:</span> {selectedPlanner ?? 'Todos os planejadores'}
            </p>
            {selectedManager !== 'all' && (
              <p><span className="font-medium">Gerente:</span> {selectedManager}</p>
            )}
            {selectedMediator !== 'all' && (
              <p><span className="font-medium">Mediador:</span> {selectedMediator}</p>
            )}
            {selectedLeader !== 'all' && (
              <p><span className="font-medium">Líder em Formação:</span> {selectedLeader}</p>
            )}
            {selectedManager === 'all' && selectedMediator === 'all' && selectedLeader === 'all' && (
              <p className="text-xs text-muted-foreground">
                Utilize os filtros gerais do topo do painel para segmentar por cargo.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Análise de Tendência */}
      {trendData && (
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {renderTrendIcon(trendData.overallTrend)}
              Análise de Tendência (janela atual vs anterior, ponderado por clientes)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {trendData.scoreChange > 0 ? '+' : ''}{trendData.scoreChange.toFixed(1)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Mudança no Score ({trendData.scoreChangePercent.toFixed(1)}%)
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {trendData.clientCountChange > 0 ? '+' : ''}{trendData.clientCountChange.toFixed(0)}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Mudança no Número de Clientes
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {trendData.overallTrend === 'improving' ? 'Melhorando' : 
                   trendData.overallTrend === 'declining' ? 'Declinando' : 'Estável'}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Tendência Geral
                </div>
              </div>
            </div>

            {/* Melhorias e Preocupações */}
            {(trendData.improvements.length > 0 || trendData.concerns.length > 0) && (
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {trendData.improvements.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
                      📈 Melhorias
                    </h4>
                    <ul className="space-y-1">
                      {trendData.improvements.map((item, index) => (
                        <li key={index} className="text-sm text-gray-600 dark:text-gray-400">
                          {item.category}: +{item.change.toFixed(1)} pts
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {trendData.concerns.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
                      ⚠️ Preocupações
                    </h4>
                    <ul className="space-y-1">
                      {trendData.concerns.map((item, index) => (
                        <li key={index} className="text-sm text-gray-600 dark:text-gray-400">
                          {item.category}: -{item.change.toFixed(1)} pts
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Gráfico Principal */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {viewMode === 'score' && <LineChart className="h-5 w-5" />}
            {viewMode === 'distribution' && <PieChart className="h-5 w-5" />}
            {viewMode === 'pillars' && <BarChart3 className="h-5 w-5" />}
            {viewMode === 'score' ? 'Evolução do Health Score' :
             viewMode === 'distribution' ? 'Distribuição por Categoria' :
             'Evolução dos Pilares'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderChart()}
        </CardContent>
      </Card>

      {/* Estatísticas Resumidas */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {currentScore.toFixed(1)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Score Atual
              </div>
            </CardContent>
          </Card>
          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {currentClientCount || chartData[chartData.length - 1]?.totalClients || 0}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total de Clientes
              </div>
            </CardContent>
          </Card>
          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {chartData.length}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Dias Analisados
              </div>
            </CardContent>
          </Card>
          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {trendData?.overallTrend === 'improving' ? '↗️' : 
                 trendData?.overallTrend === 'declining' ? '↘️' : '➡️'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Tendência
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TemporalAnalysisComponent;
