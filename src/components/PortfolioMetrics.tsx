import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  AlertTriangle, 
  Shield, 
  Activity,
  BarChart3,
  PieChart,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Info
} from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Client, Planner } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';
import { temporalService } from '@/services/temporalService';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { subDays } from 'date-fns';
import { toast } from '@/hooks/use-toast';

interface PortfolioMetricsProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
  manager?: string | "all";
  mediator?: string | "all";
  leader?: string | "all";
}

interface PortfolioData {
  portfolioHealthIndex: number;
  riskConcentration: {
    critical: number;
    warning: number;
    stable: number;
    excellent: number;
  };
  trendDirection: {
    scoreChangePercent: number; // Mudança percentual do score nos últimos 7 dias
    isImproving: boolean; // true se melhorou, false se piorou
  };
  volatilityIndex: number;
  totalClients: number;
  averageScore: number;
}

interface PlannerRiskData {
  planner: string;
  critical: number;
  warning: number;
  stable: number;
  excellent: number;
  total: number;
}

type SortColumn = 'planner' | 'total' | 'excellent' | 'stable' | 'warning' | 'critical' | 'risk';
type SortDirection = 'asc' | 'desc' | null;

const PortfolioMetrics: React.FC<PortfolioMetricsProps> = ({ clients, selectedPlanner, manager = 'all', mediator = 'all', leader = 'all', isDarkMode = false }) => {
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [plannerRiskData, setPlannerRiskData] = useState<PlannerRiskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Cache para evitar recálculos desnecessários
  const cacheRef = useRef<{
    clientsHash: string;
    portfolioData: PortfolioData | null;
    plannerRiskData: PlannerRiskData[];
  }>({
    clientsHash: '',
    portfolioData: null,
    plannerRiskData: []
  });

  // Ref para preservar scroll position
  const scrollPositionRef = useRef<number>(0);

  // Função para gerar hash dos IDs dos clientes (comparação profunda)
  const generateClientsHash = (clientsList: Client[]): string => {
    const sortedIds = clientsList
      .map(c => String(c.id))
      .sort()
      .join(',');
    const filters = `${selectedPlanner}-${manager}-${mediator}-${leader}`;
    return `${sortedIds.length}-${filters}-${sortedIds.slice(0, 100)}`; // Limitar tamanho do hash
  };

  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      if (selectedPlanner !== 'all' && client.planner !== selectedPlanner) return false;
      if (manager !== 'all' && client.manager !== manager) return false;
      if (mediator !== 'all' && client.mediator !== mediator) return false;
      if (leader !== 'all' && client.leader !== leader) return false;
      return true;
    });
  }, [clients, selectedPlanner, manager, mediator, leader]);

  // Função para ordenar os dados
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Dados ordenados
  const sortedRiskData = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return plannerRiskData;
    }

    const sorted = [...plannerRiskData].sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

      switch (sortColumn) {
        case 'planner':
          aValue = a.planner;
          bValue = b.planner;
          break;
        case 'total':
          aValue = a.total;
          bValue = b.total;
          break;
        case 'excellent':
          aValue = a.excellent;
          bValue = b.excellent;
          break;
        case 'stable':
          aValue = a.stable;
          bValue = b.stable;
          break;
        case 'warning':
          aValue = a.warning;
          bValue = b.warning;
          break;
        case 'critical':
          aValue = a.critical;
          bValue = b.critical;
          break;
        case 'risk':
          aValue = Math.round(((a.critical + a.warning) / a.total) * 100);
          bValue = Math.round(((b.critical + b.warning) / b.total) * 100);
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc'
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });

    return sorted;
  }, [plannerRiskData, sortColumn, sortDirection]);

  // Calcular métricas do portfólio
  const calculatePortfolioMetrics = async (
    clients: Client[],
    selectedPlanner: Planner | "all",
    manager: string | "all",
    mediator: string | "all",
    leader: string | "all"
  ): Promise<PortfolioData> => {
    if (clients.length === 0) {
      return {
        portfolioHealthIndex: 0,
        riskConcentration: { critical: 0, warning: 0, stable: 0, excellent: 0 },
        trendDirection: { scoreChangePercent: 0, isImproving: false },
        volatilityIndex: 0,
        totalClients: 0,
        averageScore: 0
      };
    }

    const healthScores = clients.map(client => calculateHealthScore(client));
    const totalClients = healthScores.length;
    const averageScore = healthScores.reduce((sum, score) => sum + score.score, 0) / totalClients;

    // Portfolio Health Index (score médio ponderado)
    const portfolioHealthIndex = Math.round(averageScore);

    // Risk Concentration
    const riskConcentration = {
      critical: healthScores.filter(score => score.category === "Crítico").length,
      warning: healthScores.filter(score => score.category === "Atenção").length,
      stable: healthScores.filter(score => score.category === "Estável").length,
      excellent: healthScores.filter(score => score.category === "Ótimo").length
    };

    // Trend Direction: Comparar score médio atual vs 7 dias atrás
    let trendDirection = { scoreChangePercent: 0, isImproving: false };
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = subDays(today, 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      // Buscar dados temporais agregados
      const hierarchyFilters = {
        managers: manager !== 'all' ? [manager] : undefined,
        mediators: mediator !== 'all' ? [mediator] : undefined,
        leaders: leader !== 'all' ? [leader] : undefined
      };

      const temporalData = selectedPlanner === 'all'
        ? await temporalService.getAggregatedTemporalAnalysis(sevenDaysAgo, today, hierarchyFilters)
        : await temporalService.getTemporalAnalysis(sevenDaysAgo, today, selectedPlanner, hierarchyFilters);

      // Encontrar o registro mais recente (hoje ou mais próximo)
      const latestRecord = temporalData
        .filter(record => record.recordedDate <= today)
        .sort((a, b) => b.recordedDate.getTime() - a.recordedDate.getTime())[0];

      // Encontrar o registro de 7 dias atrás (ou mais próximo disponível)
      const pastRecord = temporalData
        .filter(record => {
          const recordDate = record.recordedDate;
          return recordDate >= sevenDaysAgo && recordDate < today;
        })
        .sort((a, b) => a.recordedDate.getTime() - b.recordedDate.getTime())[0];

      // Usar score atual calculado (mais preciso) e comparar com histórico
      const currentScore = averageScore;
      
      if (pastRecord && pastRecord.avgHealthScore > 0) {
        // Comparar com dados de 7 dias atrás
        const pastScore = pastRecord.avgHealthScore;
        const change = currentScore - pastScore;
        const changePercent = (change / pastScore) * 100;
        
        trendDirection = {
          scoreChangePercent: Math.round(changePercent * 10) / 10, // Arredondar para 1 casa decimal
          isImproving: change > 0
        };
      } else if (latestRecord && latestRecord.avgHealthScore > 0 && latestRecord.recordedDate < today) {
        // Se não temos dados de 7 dias atrás, mas temos dados históricos, comparar com o mais recente disponível
        const pastScore = latestRecord.avgHealthScore;
        const change = currentScore - pastScore;
        const changePercent = pastScore > 0 
          ? (change / pastScore) * 100 
          : 0;
        
        trendDirection = {
          scoreChangePercent: Math.round(changePercent * 10) / 10,
          isImproving: change > 0
        };
      }
    } catch (error) {
      console.warn('Erro ao calcular tendência temporal:', error);
      // Em caso de erro, usar score atual como fallback
      trendDirection = { scoreChangePercent: 0, isImproving: false };
    }

    // Volatility Index: Desvio padrão dos scores (cálculo correto)
    const scores = healthScores.map(score => score.score);
    const mean = averageScore;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / totalClients;
    const volatilityIndex = Math.round(Math.sqrt(variance));

    return {
      portfolioHealthIndex,
      riskConcentration,
      trendDirection,
      volatilityIndex,
      totalClients,
      averageScore: Math.round(averageScore)
    };
  };

  // Calcular dados de risco por planejador
  const calculatePlannerRiskData = (clientsByPlanner: Client[]): PlannerRiskData[] => {
    const grouped = new Map<string, Client[]>();
    clientsByPlanner.forEach(client => {
      if (!client.planner || client.planner === '0') return;
      const key = client.planner;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(client);
    });

    return Array.from(grouped.entries()).map(([plannerName, plannerClients]) => {
      const healthScores = plannerClients.map(client => calculateHealthScore(client));
      return {
        planner: plannerName,
        critical: healthScores.filter(score => score.category === "Crítico").length,
        warning: healthScores.filter(score => score.category === "Atenção").length,
        stable: healthScores.filter(score => score.category === "Estável").length,
        excellent: healthScores.filter(score => score.category === "Ótimo").length,
        total: healthScores.length
      };
    }).filter(data => data.total > 0);
  };

  useEffect(() => {
    // Gerar hash dos clientes filtrados para comparação
    const currentHash = generateClientsHash(filteredClients);
    
    // Se os dados são os mesmos (mesmo hash), não recarregar
    if (cacheRef.current.clientsHash === currentHash && cacheRef.current.portfolioData !== null) {
      // Dados já estão em cache, apenas restaurar do cache
      setPortfolioData(cacheRef.current.portfolioData);
      setPlannerRiskData(cacheRef.current.plannerRiskData);
      setLoading(false);
      return;
    }

    // Preservar scroll position antes de mostrar loading
    scrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;

    // Só mostrar loading se realmente não temos dados ainda
    const hasData = cacheRef.current.portfolioData !== null || cacheRef.current.plannerRiskData.length > 0;
    if (!hasData) {
      setLoading(true);
    }
    
    // Calcular métricas (agora é async para buscar dados temporais)
    (async () => {
      try {
        const metrics = await calculatePortfolioMetrics(filteredClients, selectedPlanner, manager, mediator, leader);
        const riskData = calculatePlannerRiskData(filteredClients);
        
        // Atualizar cache
        cacheRef.current = {
          clientsHash: currentHash,
          portfolioData: metrics,
          plannerRiskData: riskData
        };
        
        setPortfolioData(metrics);
        setPlannerRiskData(riskData);
        setLoading(false);

        // Restaurar scroll position após um pequeno delay para garantir que o DOM foi atualizado
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollPositionRef.current > 0) {
              window.scrollTo({
                top: scrollPositionRef.current,
                behavior: 'instant' as ScrollBehavior
              });
            }
          });
        });
      } catch (error: any) {
        console.error('Erro ao calcular métricas do portfólio:', error);
        setLoading(false);
        
        // Mostrar erro ao usuário apenas se for crítico
        if (error?.code === 'TIMEOUT' || error?.message?.includes('tempo limite')) {
          toast({
            title: 'Timeout ao carregar métricas',
            description: 'A operação demorou muito. Tente novamente ou reduza o escopo da consulta.',
            variant: 'destructive',
          });
        } else if (error?.message && !error.message.includes('tendência temporal')) {
          // Não mostrar erro para problemas de tendência (já tem fallback)
          toast({
            title: 'Erro ao carregar métricas',
            description: 'Não foi possível carregar algumas métricas. Alguns dados podem estar incompletos.',
            variant: 'destructive',
          });
        }
        
        // Garantir que pelo menos dados básicos sejam exibidos
        if (!portfolioData) {
          setPortfolioData({
            portfolioHealthIndex: 0,
            riskConcentration: { critical: 0, warning: 0, stable: 0, excellent: 0 },
            trendDirection: { scoreChangePercent: 0, isImproving: false },
            volatilityIndex: 0,
            totalClients: filteredClients.length,
            averageScore: 0
          });
        }
      }
    })();
  }, [filteredClients, selectedPlanner, manager, mediator, leader]);

  // Dados para gráficos
  const pieChartData = portfolioData ? [
    { name: 'Ótimo', value: portfolioData.riskConcentration.excellent, color: '#10b981' },
    { name: 'Estável', value: portfolioData.riskConcentration.stable, color: '#3b82f6' },
    { name: 'Atenção', value: portfolioData.riskConcentration.warning, color: '#f59e0b' },
    { name: 'Crítico', value: portfolioData.riskConcentration.critical, color: '#ef4444' }
  ] : [];

  const barChartData = plannerRiskData.map(data => ({
    planner: data.planner,
    'Crítico': data.critical,
    'Atenção': data.warning,
    'Estável': data.stable,
    'Ótimo': data.excellent
  }));

  const colors = {
    excellent: isDarkMode ? '#10b981' : '#059669',
    stable: isDarkMode ? '#3b82f6' : '#2563eb',
    warning: isDarkMode ? '#f59e0b' : '#d97706',
    critical: isDarkMode ? '#ef4444' : '#dc2626'
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Carregando métricas do portfólio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Portfolio Health Metrics
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Métricas agregadas para avaliação da saúde geral da carteira
            {selectedPlanner !== "all" && ` - ${selectedPlanner}`}
          </p>
        </div>
      </div>

      {/* Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Portfolio Health Index</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolioData?.portfolioHealthIndex || 0}</div>
            <p className="text-xs text-muted-foreground">
              Score médio da carteira
            </p>
          </CardContent>
        </Card>

        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolioData?.totalClients || 0}</div>
            <p className="text-xs text-muted-foreground">
              {selectedPlanner === "all" ? "em toda equipe" : `de ${selectedPlanner}`}
            </p>
          </CardContent>
        </Card>

        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Tendência</CardTitle>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label="Informações sobre Tendência"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent 
                    className="max-w-sm p-4 z-[9999] bg-popover border border-border shadow-lg" 
                    side="right" 
                    align="start"
                    style={{ zIndex: 9999 }}
                  >
                    <div className="space-y-2 relative z-[9999]">
                      <h4 className="font-semibold text-sm">Tendência (Últimos 7 dias)</h4>
                      <p className="text-xs text-muted-foreground">
                        Mostra a variação percentual do Health Score médio comparado a 7 dias atrás.
                      </p>
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium mb-2">Como interpretar:</p>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Valor positivo (verde): Score melhorou nos últimos 7 dias</li>
                          <li>Valor negativo (vermelho): Score piorou nos últimos 7 dias</li>
                          <li>Comparação baseada em dados históricos reais do sistema</li>
                        </ul>
                      </div>
                    </div>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
            {portfolioData?.trendDirection.isImproving ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${
              portfolioData?.trendDirection.isImproving 
                ? 'text-green-600 dark:text-green-400' 
                : portfolioData?.trendDirection.scoreChangePercent < 0
                ? 'text-red-600 dark:text-red-400'
                : isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              {portfolioData?.trendDirection.scoreChangePercent !== undefined
                ? `${portfolioData.trendDirection.scoreChangePercent > 0 ? '+' : ''}${portfolioData.trendDirection.scoreChangePercent}%`
                : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              {portfolioData?.trendDirection.isImproving 
                ? 'Score melhorou' 
                : portfolioData?.trendDirection.scoreChangePercent < 0
                ? 'Score piorou'
                : 'Sem mudança'}
            </p>
          </CardContent>
        </Card>

        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-medium">Volatilidade</CardTitle>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label="Informações sobre Volatilidade"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent 
                    className="max-w-sm p-4 z-[9999] bg-popover border border-border shadow-lg" 
                    side="right" 
                    align="start"
                    style={{ zIndex: 9999 }}
                  >
                    <div className="space-y-2 relative z-[9999]">
                      <h4 className="font-semibold text-sm">Volatilidade (Desvio Padrão)</h4>
                      <p className="text-xs text-muted-foreground">
                        Mede a dispersão dos Health Scores na carteira atual. Calculado como o desvio padrão dos scores individuais.
                      </p>
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium mb-2">Como interpretar:</p>
                        <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                          <li>Valor baixo: Carteira homogênea, clientes com scores similares</li>
                          <li>Valor alto: Carteira heterogênea, grande variação entre clientes</li>
                          <li>Interpretação depende do contexto e estratégia da carteira</li>
                        </ul>
                      </div>
                    </div>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolioData?.volatilityIndex || 0}</div>
            <p className="text-xs text-muted-foreground">
              Desvio padrão dos scores
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribuição por Categoria */}
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Distribuição por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={pieChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  labelLine={true}
                  label={({ value, name }) => `${name}: ${value}`}
                >
                  {pieChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Distribution por Planejador */}
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Risk Distribution por Planejador
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                <XAxis 
                  dataKey="planner" 
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
                <Bar dataKey="Ótimo" stackId="a" fill={colors.excellent} />
                <Bar dataKey="Estável" stackId="a" fill={colors.stable} />
                <Bar dataKey="Atenção" stackId="a" fill={colors.warning} />
                <Bar dataKey="Crítico" stackId="a" fill={colors.critical} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabela de Risk Concentration */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Risk Concentration Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <table className="w-full min-w-[600px] sm:min-w-0">
              <thead>
                <tr className="border-b">
                  <th 
                    className="text-left p-2 sm:p-3 text-xs sm:text-sm cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('planner')}
                  >
                    <div className="flex items-center gap-1 sm:gap-2">
                      Planejador
                      {sortColumn === 'planner' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-center p-2 sm:p-3 text-xs sm:text-sm cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('total')}
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      Total
                      {sortColumn === 'total' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-center p-2 sm:p-3 text-xs sm:text-sm cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('excellent')}
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      Ótimo
                      {sortColumn === 'excellent' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-center p-2 sm:p-3 text-xs sm:text-sm cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('stable')}
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      Estável
                      {sortColumn === 'stable' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-center p-2 sm:p-3 text-xs sm:text-sm cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('warning')}
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      Atenção
                      {sortColumn === 'warning' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-center p-2 sm:p-3 text-xs sm:text-sm cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('critical')}
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      Crítico
                      {sortColumn === 'critical' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="text-center p-2 sm:p-3 text-xs sm:text-sm cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('risk')}
                  >
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      % Risco
                      {sortColumn === 'risk' ? (
                        sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedRiskData.map((data) => {
                  const riskPercentage = Math.round(((data.critical + data.warning) / data.total) * 100);
                  return (
                    <tr key={data.planner} className="border-b hover:bg-background/50">
                      <td className="p-2 sm:p-3 font-medium text-xs sm:text-sm">{data.planner}</td>
                      <td className="p-2 sm:p-3 text-center text-xs sm:text-sm">{data.total}</td>
                      <td className="p-2 sm:p-3 text-center text-xs sm:text-sm">
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          {data.excellent}
                        </Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-center text-xs sm:text-sm">
                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                          {data.stable}
                        </Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-center text-xs sm:text-sm">
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                          {data.warning}
                        </Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-center text-xs sm:text-sm">
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          {data.critical}
                        </Badge>
                      </td>
                      <td className="p-2 sm:p-3 text-center text-xs sm:text-sm">
                        <Badge 
                          variant={riskPercentage > 40 ? "destructive" : riskPercentage > 20 ? "secondary" : "outline"}
                        >
                          {riskPercentage}%
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PortfolioMetrics;
