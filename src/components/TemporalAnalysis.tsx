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

interface TemporalAnalysisProps {
  isDarkMode?: boolean;
  selectedPlanner?: string | null;
  selectedManager?: string | "all";
  selectedMediator?: string | "all";
  selectedLeader?: string | "all";
  currentClientCount?: number;
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
}) => {
  const [analysisData, setAnalysisData] = useState<TemporalAnalysis[]>([]);
  const [trendData, setTrendData] = useState<TrendAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    from: startOfDay(subDays(new Date(), DEFAULT_DAYS)),
    to: endOfDay(new Date())
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
    const now = new Date();
    setDateRange({
      from: startOfDay(subDays(now, days)),
      to: endOfDay(now)
    });
  };

  const handleDateChange = (range: { from?: Date; to?: Date }) => {
    if (!range?.from) return;
    const from = startOfDay(range.from);
    const to = range?.to ? endOfDay(range.to) : endOfDay(range.from);
    setDateRange({ from, to });
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

      const data = !selectedPlanner
        ? await temporalService.getAggregatedTemporalAnalysis(dateRange.from, dateRange.to, hierarchyFilters)
        : await temporalService.getTemporalAnalysis(dateRange.from, dateRange.to, selectedPlanner as Planner, hierarchyFilters);

      setAnalysisData(data);
    } catch (error) {
      console.error('Erro ao carregar dados temporais:', error);
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

  // Preparar dados para gráficos
  const prepareChartData = () => {
    return analysisData.map(item => ({
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
  };

  const chartData = prepareChartData();

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
              dataKey="date" 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
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
            />
            {chartType === 'area' ? (
              <Area
                type="monotone"
                dataKey="avgScore"
                stroke={colors.score}
                fill={colors.score}
                fillOpacity={0.3}
                strokeWidth={2}
              />
            ) : chartType === 'line' ? (
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke={colors.score}
                strokeWidth={3}
                dot={{ fill: colors.score, strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: colors.score, strokeWidth: 2 }}
              />
            ) : (
              <Bar dataKey="avgScore" fill={colors.score} />
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
              dataKey="date" 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
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
            />
            <Area type="monotone" dataKey="excellent" stackId="1" stroke={colors.excellent} fill={colors.excellent} />
            <Area type="monotone" dataKey="stable" stackId="1" stroke={colors.stable} fill={colors.stable} />
            <Area type="monotone" dataKey="warning" stackId="1" stroke={colors.warning} fill={colors.warning} />
            <Area type="monotone" dataKey="critical" stackId="1" stroke={colors.critical} fill={colors.critical} />
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
              dataKey="date" 
              stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
              fontSize={12}
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
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Análise Temporal
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Acompanhe a evolução do Health Score ao longo do tempo
          </p>
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
                {chartData[chartData.length - 1]?.avgScore.toFixed(1) || '0'}
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
