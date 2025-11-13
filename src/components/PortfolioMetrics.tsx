import React, { useState, useEffect, useMemo } from 'react';
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
  ArrowUpDown
} from 'lucide-react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Client, Planner } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';

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
    improving: number;
    declining: number;
    stable: number;
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
  const calculatePortfolioMetrics = (clients: Client[]): PortfolioData => {
    if (clients.length === 0) {
      return {
        portfolioHealthIndex: 0,
        riskConcentration: { critical: 0, warning: 0, stable: 0, excellent: 0 },
        trendDirection: { improving: 0, declining: 0, stable: 0 },
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

    // Trend Direction (simulado - baseado na distribuição atual)
    const totalRisk = riskConcentration.critical + riskConcentration.warning;
    const totalHealthy = riskConcentration.stable + riskConcentration.excellent;
    
    const trendDirection = {
      improving: Math.round((totalHealthy / totalClients) * 100),
      declining: Math.round((totalRisk / totalClients) * 100),
      stable: Math.round(((totalClients - totalRisk - totalHealthy) / totalClients) * 100)
    };

    // Volatility Index (simulado - baseado no desvio padrão dos scores)
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
    setLoading(true);
    
    // Simular delay para mostrar loading
    setTimeout(() => {
      const metrics = calculatePortfolioMetrics(filteredClients);
      const riskData = calculatePlannerRiskData(filteredClients);
      
      setPortfolioData(metrics);
      setPlannerRiskData(riskData);
      setLoading(false);
    }, 500);
  }, [filteredClients]);

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
            <CardTitle className="text-sm font-medium">Tendência</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {portfolioData?.trendDirection.improving || 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              Clientes melhorando
            </p>
          </CardContent>
        </Card>

        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Volatilidade</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{portfolioData?.volatilityIndex || 0}</div>
            <p className="text-xs text-muted-foreground">
              Índice de estabilidade
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th 
                    className="text-left p-2 cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('planner')}
                  >
                    <div className="flex items-center gap-2">
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
                    className="text-center p-2 cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('total')}
                  >
                    <div className="flex items-center justify-center gap-2">
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
                    className="text-center p-2 cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('excellent')}
                  >
                    <div className="flex items-center justify-center gap-2">
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
                    className="text-center p-2 cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('stable')}
                  >
                    <div className="flex items-center justify-center gap-2">
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
                    className="text-center p-2 cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('warning')}
                  >
                    <div className="flex items-center justify-center gap-2">
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
                    className="text-center p-2 cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('critical')}
                  >
                    <div className="flex items-center justify-center gap-2">
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
                    className="text-center p-2 cursor-pointer hover:bg-background/50 transition-colors"
                    onClick={() => handleSort('risk')}
                  >
                    <div className="flex items-center justify-center gap-2">
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
                      <td className="p-2 font-medium">{data.planner}</td>
                      <td className="p-2 text-center">{data.total}</td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          {data.excellent}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                          {data.stable}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                          {data.warning}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          {data.critical}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
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
