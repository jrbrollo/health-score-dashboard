import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Link, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  BarChart3,
  Target,
  AlertTriangle
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Client, Planner } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';

interface CorrelationAnalysisProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
}

interface CorrelationData {
  pillar1: string;
  pillar2: string;
  correlation: number;
  strength: 'weak' | 'moderate' | 'strong';
  direction: 'positive' | 'negative';
}

interface PillarImpact {
  pillar: string;
  correlation: number;
  varianceExplained: number;
  impact: 'high' | 'medium' | 'low';
}

interface CriticalCombination {
  combination: string;
  frequency: number;
  riskLevel: 'high' | 'medium' | 'low';
}

const CorrelationAnalysis: React.FC<CorrelationAnalysisProps> = ({ clients, selectedPlanner, isDarkMode = false }) => {
  const [correlationMatrix, setCorrelationMatrix] = useState<CorrelationData[]>([]);
  const [pillarImpacts, setPillarImpacts] = useState<PillarImpact[]>([]);
  const [criticalCombinations, setCriticalCombinations] = useState<CriticalCombination[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtrar clientes por planejador
  const filteredClients = useMemo(() => {
    if (selectedPlanner === "all") return clients;
    return clients.filter(client => client.planner === selectedPlanner);
  }, [clients, selectedPlanner]);

  // Calcular correlação de Pearson entre dois arrays
  const calculateCorrelation = (x: number[], y: number[]): number => {
    if (x.length !== y.length || x.length === 0) return 0;
    
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    return denominator === 0 ? 0 : numerator / denominator;
  };

  // Calcular matriz de correlação
  const calculateCorrelationMatrix = (): CorrelationData[] => {
    const pillars = [
      { key: 'meeting', name: 'Reuniões' },
      { key: 'app', name: 'App Usage' },
      { key: 'payment', name: 'Pagamentos' },
      { key: 'ecosystem', name: 'Ecossistema' },
      { key: 'nps', name: 'NPS' }
    ];

    const correlations: CorrelationData[] = [];
    
    // Preparar dados dos pilares
    const pillarData = pillars.map(pillar => ({
      key: pillar.key,
      name: pillar.name,
      values: filteredClients.map(client => {
        switch (pillar.key) {
          case 'meeting': return client.meetingEngagement || 0;
          case 'app': return client.appUsage || 0;
          case 'payment': return client.paymentStatus || 0;
          case 'ecosystem': return client.ecosystemEngagement || 0;
          case 'nps': return client.npsScore || 0;
          default: return 0;
        }
      })
    }));

    // Calcular correlações entre todos os pares
    for (let i = 0; i < pillarData.length; i++) {
      for (let j = i + 1; j < pillarData.length; j++) {
        const correlation = calculateCorrelation(pillarData[i].values, pillarData[j].values);
        const absCorrelation = Math.abs(correlation);
        
        let strength: 'weak' | 'moderate' | 'strong' = 'weak';
        if (absCorrelation >= 0.7) strength = 'strong';
        else if (absCorrelation >= 0.3) strength = 'moderate';
        
        correlations.push({
          pillar1: pillarData[i].name,
          pillar2: pillarData[j].name,
          correlation: Math.round(correlation * 100) / 100,
          strength,
          direction: correlation >= 0 ? 'positive' : 'negative'
        });
      }
    }

    return correlations;
  };

  // Calcular impacto dos pilares no Health Score total
  const calculatePillarImpacts = (): PillarImpact[] => {
    const pillars = [
      { key: 'meeting', name: 'Reuniões' },
      { key: 'app', name: 'App Usage' },
      { key: 'payment', name: 'Pagamentos' },
      { key: 'ecosystem', name: 'Ecossistema' },
      { key: 'nps', name: 'NPS' }
    ];

    const healthScores = filteredClients.map(client => calculateHealthScore(client).score);
    
    return pillars.map(pillar => {
      const pillarValues = filteredClients.map(client => {
        switch (pillar.key) {
          case 'meeting': return client.meetingEngagement || 0;
          case 'app': return client.appUsage || 0;
          case 'payment': return client.paymentStatus || 0;
          case 'ecosystem': return client.ecosystemEngagement || 0;
          case 'nps': return client.npsScore || 0;
          default: return 0;
        }
      });

      const correlation = calculateCorrelation(pillarValues, healthScores);
      const varianceExplained = Math.pow(correlation, 2) * 100;
      
      let impact: 'high' | 'medium' | 'low' = 'low';
      if (varianceExplained >= 50) impact = 'high';
      else if (varianceExplained >= 25) impact = 'medium';

      return {
        pillar: pillar.name,
        correlation: Math.round(correlation * 100) / 100,
        varianceExplained: Math.round(varianceExplained * 100) / 100,
        impact
      };
    });
  };

  // Calcular combinações críticas (simulado)
  const calculateCriticalCombinations = (): CriticalCombination[] => {
    const combinations = [
      { combination: 'Reuniões + App Usage', frequency: 15, riskLevel: 'high' as const },
      { combination: 'Pagamentos + Ecossistema', frequency: 12, riskLevel: 'high' as const },
      { combination: 'NPS + Reuniões', frequency: 8, riskLevel: 'medium' as const },
      { combination: 'App Usage + Ecossistema', frequency: 6, riskLevel: 'medium' as const },
      { combination: 'Pagamentos + NPS', frequency: 4, riskLevel: 'low' as const }
    ];

    return combinations;
  };

  useEffect(() => {
    setLoading(true);
    
    setTimeout(() => {
      const correlations = calculateCorrelationMatrix();
      const impacts = calculatePillarImpacts();
      const combinations = calculateCriticalCombinations();
      
      setCorrelationMatrix(correlations);
      setPillarImpacts(impacts);
      setCriticalCombinations(combinations);
      setLoading(false);
    }, 500);
  }, [filteredClients]);

  const getCorrelationColor = (correlation: number) => {
    const abs = Math.abs(correlation);
    if (abs >= 0.7) return isDarkMode ? 'bg-blue-900' : 'bg-blue-100';
    if (abs >= 0.3) return isDarkMode ? 'bg-yellow-900' : 'bg-yellow-100';
    return isDarkMode ? 'bg-gray-800' : 'bg-gray-100';
  };

  const getCorrelationTextColor = (correlation: number) => {
    const abs = Math.abs(correlation);
    if (abs >= 0.7) return isDarkMode ? 'text-blue-300' : 'text-blue-800';
    if (abs >= 0.3) return isDarkMode ? 'text-yellow-300' : 'text-yellow-800';
    return isDarkMode ? 'text-gray-500' : 'text-gray-400';
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return isDarkMode ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800';
      case 'medium': return isDarkMode ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-800';
      case 'low': return isDarkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800';
      default: return isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high': return isDarkMode ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800';
      case 'medium': return isDarkMode ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-800';
      case 'low': return isDarkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800';
      default: return isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Carregando análise de correlações...</p>
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
            Análise de Correlações
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Relacionamentos entre pilares e impacto no Health Score
            {selectedPlanner !== "all" && ` - ${selectedPlanner}`}
          </p>
        </div>
      </div>

      {/* Matriz de Correlação */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Matriz de Correlação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {correlationMatrix.map((correlation, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${getCorrelationColor(correlation.correlation)}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">
                    {correlation.pillar1} ↔ {correlation.pillar2}
                  </div>
                  <div className="flex items-center gap-1">
                    {correlation.direction === 'positive' ? (
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                </div>
                <div className={`text-2xl font-bold ${getCorrelationTextColor(correlation.correlation)}`}>
                  {correlation.correlation}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {correlation.strength === 'strong' ? 'Forte' : 
                     correlation.strength === 'moderate' ? 'Moderada' : 'Fraca'}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {correlation.direction === 'positive' ? 'Positiva' : 'Negativa'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Impacto dos Pilares */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Impacto dos Pilares
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={pillarImpacts}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                <XAxis 
                  dataKey="pillar" 
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
                <Bar dataKey="varianceExplained" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Detalhes do Impacto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pillarImpacts.map((pillar, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-background/50">
                  <div>
                    <div className="font-medium">{pillar.pillar}</div>
                    <div className="text-sm text-muted-foreground">
                      Correlação: {pillar.correlation}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {pillar.varianceExplained}%
                    </div>
                    <Badge className={getImpactColor(pillar.impact)}>
                      {pillar.impact === 'high' ? 'Alto' : 
                       pillar.impact === 'medium' ? 'Médio' : 'Baixo'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Combinações Críticas */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Combinações Críticas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {criticalCombinations.map((combination, index) => (
              <div key={index} className="flex items-center justify-between p-4 rounded-lg border bg-background/50">
                <div>
                  <div className="font-medium">{combination.combination}</div>
                  <div className="text-sm text-muted-foreground">
                    Frequência: {combination.frequency} ocorrências
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {combination.frequency}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      ocorrências
                    </div>
                  </div>
                  <Badge className={getRiskColor(combination.riskLevel)}>
                    {combination.riskLevel === 'high' ? 'Alto Risco' : 
                     combination.riskLevel === 'medium' ? 'Médio Risco' : 'Baixo Risco'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Minus className="h-5 w-5" />
            Legenda de Correlação
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Força da Correlação</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100'}`}></div>
                  <span>Forte (&gt;=0.7)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${isDarkMode ? 'bg-yellow-900' : 'bg-yellow-100'}`}></div>
                  <span>Moderada (0.3-0.7)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}></div>
                  <span>Fraca (&lt;0.3)</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Direção</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" />
                  <span>Positiva</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-red-500" />
                  <span>Negativa</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Impacto</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-red-100 text-red-800">Alto</Badge>
                  <span>&gt;=50% variância</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-yellow-100 text-yellow-800">Médio</Badge>
                  <span>25-50% variância</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800">Baixo</Badge>
                  <span>&lt;25% variância</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorrelationAnalysis;
