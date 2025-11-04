import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Shield, 
  Target,
  BarChart3,
  Radar,
  Award,
  AlertTriangle
} from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar as RechartsRadar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Client, Planner } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';

interface PlannerBenchmarkProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
}

interface PlannerPerformance {
  planner: string;
  clientCount: number;
  averageScore: number;
  improvementRate: number;
  recoveryRate: number;
  stabilityScore: number;
  portfolioRisk: number;
  pillarScores: {
    meeting: number;
    app: number;
    payment: number;
    ecosystem: number;
    nps: number;
  };
  consistency: number;
  ranking: number;
}

interface PillarComparison {
  pillar: string;
  average: number;
  planners: { planner: string; score: number; aboveAverage: boolean }[];
}

const PlannerBenchmark: React.FC<PlannerBenchmarkProps> = ({ clients, selectedPlanner, isDarkMode = false }) => {
  const [plannerPerformance, setPlannerPerformance] = useState<PlannerPerformance[]>([]);
  const [pillarComparison, setPillarComparison] = useState<PillarComparison[]>([]);
  const [loading, setLoading] = useState(true);

  // Calcular performance de cada planejador
  const calculatePlannerPerformance = (): PlannerPerformance[] => {
    const planners = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraao", "Murilo", "Felipe", "Helio", "Vinícius"];
    
    return planners.map(planner => {
      const plannerClients = clients.filter(client => client.planner === planner);
      if (plannerClients.length === 0) return null;

      const healthScores = plannerClients.map(client => calculateHealthScore(client));
      const averageScore = healthScores.reduce((sum, score) => sum + score.score, 0) / healthScores.length;
      
      // Calcular scores por pilar com proteção contra NaN
      const pillarScores = {
        meeting: plannerClients.length > 0 ? plannerClients.reduce((sum, client) => sum + (client.meetingEngagement || 0), 0) / plannerClients.length : 0,
        app: plannerClients.length > 0 ? plannerClients.reduce((sum, client) => sum + (client.appUsage || 0), 0) / plannerClients.length : 0,
        payment: plannerClients.length > 0 ? plannerClients.reduce((sum, client) => sum + (client.paymentStatus || 0), 0) / plannerClients.length : 0,
        ecosystem: plannerClients.length > 0 ? plannerClients.reduce((sum, client) => sum + (client.ecosystemEngagement || 0), 0) / plannerClients.length : 0,
        nps: plannerClients.length > 0 ? plannerClients.reduce((sum, client) => sum + (client.npsScore || 0), 0) / plannerClients.length : 0,
      };

      // Taxa de melhoria (simulada - baseada na distribuição atual)
      const excellentCount = healthScores.filter(score => score.category === "Ótimo").length;
      const improvementRate = Math.round((excellentCount / healthScores.length) * 100);

      // Recovery Rate (simulado - baseado em clientes que saíram do crítico)
      const criticalCount = healthScores.filter(score => score.category === "Crítico").length;
      const recoveryRate = Math.round(((healthScores.length - criticalCount) / healthScores.length) * 100);

      // Stability Score (baseado no desvio padrão - menor = mais estável)
      const scores = healthScores.map(score => score.score);
      const mean = averageScore;
      const variance = scores.length > 1 ? scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length : 0;
      const stabilityScore = Math.round(Math.max(0, 100 - Math.sqrt(variance))); // Invertido: maior = mais estável

      // Portfolio Risk (% de clientes em risco)
      const riskCount = healthScores.filter(score => 
        score.category === "Crítico" || score.category === "Atenção"
      ).length;
      const portfolioRisk = Math.round((riskCount / healthScores.length) * 100);

      // Consistency (baseado na estabilidade dos scores)
      const consistency = Math.max(0, Math.min(100, stabilityScore));

      return {
        planner,
        clientCount: plannerClients.length,
        averageScore: Math.round(averageScore),
        improvementRate,
        recoveryRate,
        stabilityScore,
        portfolioRisk,
        pillarScores,
        consistency,
        ranking: 0 // Será calculado depois
      };
    }).filter(Boolean) as PlannerPerformance[];
  };

  // Calcular comparação de pilares
  const calculatePillarComparison = (): PillarComparison[] => {
    const pillars = [
      { key: 'meeting', name: 'Reuniões' },
      { key: 'app', name: 'App Usage' },
      { key: 'payment', name: 'Pagamentos' },
      { key: 'ecosystem', name: 'Ecossistema' },
      { key: 'nps', name: 'NPS' }
    ];

    return pillars.map(pillar => {
      const pillarData = plannerPerformance.map(planner => ({
        planner: planner.planner,
        score: planner.pillarScores[pillar.key as keyof typeof planner.pillarScores],
        aboveAverage: false
      }));

      const average = pillarData.reduce((sum, item) => sum + item.score, 0) / pillarData.length;
      
      // Marcar quais estão acima da média
      pillarData.forEach(item => {
        item.aboveAverage = item.score > average;
      });

      return {
        pillar: pillar.name,
        average: Math.round(average),
        planners: pillarData
      };
    });
  };

  // Atualizar rankings
  const updateRankings = (performance: PlannerPerformance[]): PlannerPerformance[] => {
    // Ordenar por score médio
    const sorted = [...performance].sort((a, b) => b.averageScore - a.averageScore);
    
    return sorted.map((planner, index) => ({
      ...planner,
      ranking: index + 1
    }));
  };

  useEffect(() => {
    setLoading(true);
    
    setTimeout(() => {
      const performance = calculatePlannerPerformance();
      const rankedPerformance = updateRankings(performance);
      const pillarComp = calculatePillarComparison();
      
      setPlannerPerformance(rankedPerformance);
      setPillarComparison(pillarComp);
      setLoading(false);
    }, 500);
  }, [clients]);

  // Dados para gráficos
  const radarData = plannerPerformance.map(planner => ({
    planner: planner.planner,
    Reuniões: planner.pillarScores.meeting,
    'App Usage': planner.pillarScores.app,
    Pagamentos: planner.pillarScores.payment,
    Ecossistema: planner.pillarScores.ecosystem,
    NPS: planner.pillarScores.nps
  }));

  const barChartData = plannerPerformance.map(planner => ({
    planner: planner.planner,
    'Score Médio': planner.averageScore,
    'Taxa Melhoria': planner.improvementRate,
    'Recovery Rate': planner.recoveryRate,
    'Estabilidade': planner.stabilityScore
  }));

  const colors = {
    excellent: isDarkMode ? '#10b981' : '#059669',
    stable: isDarkMode ? '#3b82f6' : '#2563eb',
    warning: isDarkMode ? '#f59e0b' : '#d97706',
    critical: isDarkMode ? '#ef4444' : '#dc2626',
    primary: isDarkMode ? '#8b5cf6' : '#7c3aed'
  };

  const getPerformanceColor = (ranking: number) => {
    if (ranking <= 2) return 'text-green-600 bg-green-100 border-green-200';
    if (ranking <= 4) return 'text-yellow-600 bg-yellow-100 border-yellow-200';
    return 'text-red-600 bg-red-100 border-red-200';
  };

  const getPerformanceBadge = (ranking: number) => {
    if (ranking === 1) return { text: '🥇 Top Performer', color: 'bg-yellow-500' };
    if (ranking === 2) return { text: '🥈 Excelente', color: 'bg-gray-400' };
    if (ranking === 3) return { text: '🥉 Bom', color: 'bg-amber-600' };
    if (ranking <= 5) return { text: '📈 Em Crescimento', color: 'bg-blue-500' };
    return { text: '📊 Padrão', color: 'bg-gray-500' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Carregando benchmarking de planejadores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Benchmarking de Planejadores
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Comparação de performance e especialização por pilar
            {selectedPlanner !== "all" && ` - ${selectedPlanner}`}
          </p>
        </div>
      </div>

      {/* Performance Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Performance */}
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              Performance Ranking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {plannerPerformance.slice(0, 5).map((planner) => {
                const badge = getPerformanceBadge(planner.ranking);
                return (
                  <div key={planner.planner} className="flex items-center justify-between p-4 rounded-lg border bg-background/50">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${badge.color}`}>
                        {planner.ranking}
                      </div>
                      <div>
                        <div className="font-medium">{planner.planner}</div>
                        <div className="text-sm text-muted-foreground">
                          {planner.clientCount} clientes
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-semibold">{planner.averageScore}</div>
                        <div className="text-xs text-muted-foreground">Score Médio</div>
                      </div>
                      <Badge className={getPerformanceColor(planner.ranking)}>
                        {badge.text}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Métricas Detalhadas */}
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Métricas Detalhadas
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
                <Bar dataKey="Score Médio" fill={colors.primary} />
                <Bar dataKey="Taxa Melhoria" fill={colors.excellent} />
                <Bar dataKey="Recovery Rate" fill={colors.stable} />
                <Bar dataKey="Estabilidade" fill={colors.warning} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Radar Chart - Especialização por Pilar */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radar className="h-5 w-5" />
            Especialização por Pilar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="planner" />
              <PolarRadiusAxis angle={90} domain={[0, 100]} />
              <RechartsRadar
                name="Reuniões"
                dataKey="Reuniões"
                stroke={colors.primary}
                fill={colors.primary}
                fillOpacity={0.1}
              />
              <RechartsRadar
                name="App Usage"
                dataKey="App Usage"
                stroke={colors.excellent}
                fill={colors.excellent}
                fillOpacity={0.1}
              />
              <RechartsRadar
                name="Pagamentos"
                dataKey="Pagamentos"
                stroke={colors.stable}
                fill={colors.stable}
                fillOpacity={0.1}
              />
              <RechartsRadar
                name="Ecossistema"
                dataKey="Ecossistema"
                stroke={colors.warning}
                fill={colors.warning}
                fillOpacity={0.1}
              />
              <RechartsRadar
                name="NPS"
                dataKey="NPS"
                stroke={colors.critical}
                fill={colors.critical}
                fillOpacity={0.1}
              />
            </RadarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela Completa de Performance */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Tabela Completa de Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Ranking</th>
                  <th className="text-left p-2">Planejador</th>
                  <th className="text-center p-2">Clientes</th>
                  <th className="text-center p-2">Score Médio</th>
                  <th className="text-center p-2">Melhoria</th>
                  <th className="text-center p-2">Recovery</th>
                  <th className="text-center p-2">Estabilidade</th>
                  <th className="text-center p-2">% Risco</th>
                  <th className="text-center p-2">Consistência</th>
                </tr>
              </thead>
              <tbody>
                {plannerPerformance.map((planner) => {
                  const badge = getPerformanceBadge(planner.ranking);
                  return (
                    <tr key={planner.planner} className="border-b hover:bg-background/50">
                      <td className="p-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-sm ${badge.color}`}>
                          {planner.ranking}
                        </div>
                      </td>
                      <td className="p-2 font-medium">{planner.planner}</td>
                      <td className="p-2 text-center">{planner.clientCount}</td>
                      <td className="p-2 text-center font-semibold">{planner.averageScore}</td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          {planner.improvementRate}%
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-blue-600 border-blue-600">
                          {planner.recoveryRate}%
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-purple-600 border-purple-600">
                          {planner.stabilityScore}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge 
                          variant={planner.portfolioRisk > 40 ? "destructive" : planner.portfolioRisk > 20 ? "secondary" : "outline"}
                        >
                          {planner.portfolioRisk}%
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <Badge variant="outline" className="text-orange-600 border-orange-600">
                          {planner.consistency}%
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

      {/* Análise de Pilares */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Análise de Especialização por Pilar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pillarComparison.map((pillar) => (
              <div key={pillar.pillar} className="p-4 border rounded-lg bg-background/50">
                <h4 className="font-semibold mb-3">{pillar.pillar}</h4>
                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Média: {pillar.average} pontos
                  </div>
                  <div className="space-y-1">
                    {pillar.planners
                      .sort((a, b) => b.score - a.score)
                      .slice(0, 3)
                      .map((planner) => (
                        <div key={planner.planner} className="flex justify-between items-center text-sm">
                          <span className={planner.aboveAverage ? 'font-semibold text-green-600' : ''}>
                            {planner.planner}
                          </span>
                          <Badge 
                            variant={planner.aboveAverage ? "default" : "outline"}
                            className={planner.aboveAverage ? "bg-green-100 text-green-800" : ""}
                          >
                            {Math.round(planner.score)}
                          </Badge>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlannerBenchmark;
