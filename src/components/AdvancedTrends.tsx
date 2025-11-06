import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Target,
  AlertTriangle,
  Users,
  Calendar,
  Activity,
  Zap,
  Shield
} from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, BarChart, Bar } from 'recharts';
import { Client, Planner } from '@/types/client';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { temporalService } from '@/services/temporalService';
import { TemporalAnalysis } from '@/types/temporal';
import { calculateHealthScore } from '@/utils/healthScore';
import { applyHierarchyFilters } from '@/lib/filters';

interface AdvancedTrendsProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
  manager?: string | 'all';
  mediator?: string | 'all';
  leader?: string | 'all';
}

interface TrendData {
  date: string;
  rawDate: Date;
  score: number;
  clients: number;
  excellent: number;
  stable: number;
  warning: number;
  critical: number;
}

interface TrendMetrics {
  overallTrend: 'improving' | 'declining' | 'stable';
  trendStrength: number;
  volatility: number;
  momentum: number;
  acceleration: number;
}

interface SeasonalPattern {
  period: string;
  averageScore: number;
  variance: number;
  trend: 'up' | 'down' | 'stable';
}

interface PredictiveInsight {
  category: string;
  probability: number;
  timeframe: string;
  confidence: 'high' | 'medium' | 'low';
}

const AdvancedTrends: React.FC<AdvancedTrendsProps> = ({ clients, selectedPlanner, isDarkMode = false, manager = 'all', mediator = 'all', leader = 'all' }) => {
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [trendMetrics, setTrendMetrics] = useState<TrendMetrics | null>(null);
  const [seasonalPatterns, setSeasonalPatterns] = useState<SeasonalPattern[]>([]);
  const [predictiveInsights, setPredictiveInsights] = useState<PredictiveInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d'>('30d');
  const [error, setError] = useState<string | null>(null);

  const normalizeDate = (date: Date) => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  const filteredClients = useMemo(() => {
    return applyHierarchyFilters(clients, {
      selectedPlanner: selectedPlanner === 'all' ? null : selectedPlanner,
      managers: manager === 'all' ? [] : [manager],
      mediators: mediator === 'all' ? [] : [mediator],
      leaders: leader === 'all' ? [] : [leader]
    });
  }, [clients, selectedPlanner, manager, mediator, leader]);

  const buildSnapshotFromClients = (clientList: Client[]): TrendData | null => {
    if (!clientList || clientList.length === 0) return null;

    const latestSnapshotMs = clientList.reduce((max, current) => {
      const lastSeen = current.lastSeenAt ? current.lastSeenAt.getTime() : NaN;
      const updated = current.updatedAt ? current.updatedAt.getTime() : NaN;
      const candidate = Number.isFinite(lastSeen) ? lastSeen : updated;
      return Math.max(max, candidate);
    }, 0);

    // Se não houver data válida, não criar snapshot
    if (!latestSnapshotMs || !Number.isFinite(latestSnapshotMs)) return null;

    const snapshotDate = normalizeDate(new Date(latestSnapshotMs));

    const counts = {
      'Ótimo': 0,
      'Estável': 0,
      'Atenção': 0,
      'Crítico': 0
    } as Record<'Ótimo' | 'Estável' | 'Atenção' | 'Crítico', number>;

    let totalScore = 0;

    clientList.forEach(client => {
      const result = calculateHealthScore(client);
      totalScore += result.score;
      counts[result.category] = (counts[result.category] || 0) + 1;
    });

    const avgScore = clientList.length > 0 ? totalScore / clientList.length : 0;

    return {
      date: format(snapshotDate, 'dd/MM', { locale: ptBR }),
      rawDate: snapshotDate,
      score: Math.round(avgScore * 100) / 100,
      clients: clientList.length,
      excellent: counts['Ótimo'] ?? 0,
      stable: counts['Estável'] ?? 0,
      warning: counts['Atenção'] ?? 0,
      critical: counts['Crítico'] ?? 0,
    };
  };

  // Buscar série temporal real (as-of) do serviço
  const loadTemporalSeries = async (): Promise<TrendData[]> => {
    const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
    const end = new Date();
    const start = subDays(end, days - 1);

    const useAggregated = !selectedPlanner || selectedPlanner === 'all';
    const series: TemporalAnalysis[] = useAggregated
      ? await temporalService.getAggregatedTemporalAnalysis(start, end, {
          managers: manager === 'all' ? undefined : [manager],
          mediators: mediator === 'all' ? undefined : [mediator],
          leaders: leader === 'all' ? undefined : [leader]
        })
      : await temporalService.getTemporalAnalysis(start, end, selectedPlanner as any, {
          managers: manager === 'all' ? undefined : [manager],
          mediators: mediator === 'all' ? undefined : [mediator],
          leaders: leader === 'all' ? undefined : [leader]
        });

    const dedupedByDay = new Map<string, TemporalAnalysis>();
    series.forEach(item => {
      if (!item?.recordedDate) return;
      const key = item.recordedDate.toISOString().split('T')[0];
      const existing = dedupedByDay.get(key);
      if (!existing || existing.recordedDate < item.recordedDate) {
        dedupedByDay.set(key, item);
      }
    });

    const ordered = Array.from(dedupedByDay.values()).sort(
      (a, b) => a.recordedDate.getTime() - b.recordedDate.getTime()
    );

    const result = ordered.map(s => ({
      date: format(s.recordedDate, 'dd/MM', { locale: ptBR }),
      rawDate: s.recordedDate,
      score: Number(s.avgHealthScore ?? 0),
      clients: s.totalClients ?? 0,
      excellent: s.excellentCount ?? 0,
      stable: s.stableCount ?? 0,
      warning: s.warningCount ?? 0,
      critical: s.criticalCount ?? 0,
    }));

    const latestFromClients = buildSnapshotFromClients(filteredClients);
    if (latestFromClients) {
      const latestServiceDate = result.length ? normalizeDate(result[result.length - 1].rawDate) : null;
      const latestClientDate = normalizeDate(latestFromClients.rawDate);

      if (!latestServiceDate || latestClientDate.getTime() > latestServiceDate.getTime()) {
        result.push(latestFromClients);
      } else if (latestClientDate.getTime() === latestServiceDate.getTime()) {
        result[result.length - 1] = latestFromClients;
      }
    }

    result.sort((a, b) => a.rawDate.getTime() - b.rawDate.getTime());

    if (import.meta.env.DEV) {
      console.debug('[AdvancedTrends] Série temporal carregada:', result.map(r => ({ date: r.rawDate.toISOString().split('T')[0], score: r.score, clients: r.clients })));
    }

    return result;
  };

  // Calcular métricas de tendência (janela atual vs anterior, ponderado por clientes)
  const calculateTrendMetrics = (data: TrendData[]): TrendMetrics => {
    if (data.length < 2) {
      return {
        overallTrend: 'stable',
        trendStrength: 0,
        volatility: 0,
        momentum: 0,
        acceleration: 0
      };
    }

    const half = Math.floor(data.length / 2);
    const prior = data.slice(0, half);
    const recent = data.slice(half);

    const weightedAvg = (arr: TrendData[]) => {
      const totalClients = arr.reduce((s, d) => s + (d.clients || 0), 0);
      if (totalClients === 0) return 0;
      const sum = arr.reduce((s, d) => s + d.score * (d.clients || 0), 0);
      return sum / totalClients;
    };

    const firstAvg = weightedAvg(prior);
    const secondAvg = weightedAvg(recent);

    const trendStrength = Math.abs(secondAvg - firstAvg);
    const overallTrend = secondAvg > firstAvg + 5 ? 'improving' : 
                        secondAvg < firstAvg - 5 ? 'declining' : 'stable';
    
    // Volatilidade simples baseada na variação do score médio
    const scores = data.map(d => d.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const volatility = Math.sqrt(variance);

    // Momentum e aceleração simplificados
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    const momentum = (secondHalf[secondHalf.length - 1] ?? 0) - (firstHalf[firstHalf.length - 1] ?? 0);
    const acceleration = momentum - ((firstHalf[firstHalf.length - 1] ?? 0) - (firstHalf[0] ?? 0));

    return {
      overallTrend,
      trendStrength: Math.round(trendStrength * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      momentum: Math.round(momentum * 100) / 100,
      acceleration: Math.round(acceleration * 100) / 100
    };
  };

  const weekdayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  // Calcular padrões sazonais reais por dia da semana
  const calculateSeasonalPatterns = (data: TrendData[]): SeasonalPattern[] => {
    if (data.length === 0) return [];
    const grouped = new Map<number, TrendData[]>();
    for (const point of data) {
      const day = point.rawDate.getDay();
      if (!grouped.has(day)) grouped.set(day, []);
      grouped.get(day)!.push(point);
    }

    return Array.from(grouped.entries()).map(([day, points]) => {
      const scores = points.map(p => p.score);
      const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + Math.pow(s - average, 2), 0) / scores.length;

      const half = Math.max(1, Math.floor(points.length / 2));
      const earlier = points.slice(0, points.length - half).map(p => p.score);
      const recent = points.slice(points.length - half).map(p => p.score);
      const avgEarlier = earlier.length ? earlier.reduce((s, v) => s + v, 0) / earlier.length : average;
      const avgRecent = recent.length ? recent.reduce((s, v) => s + v, 0) / recent.length : average;
      const trend = avgRecent > avgEarlier + 2 ? 'up' : avgRecent < avgEarlier - 2 ? 'down' : 'stable';

      return {
        period: weekdayLabels[day],
        averageScore: Math.round(average * 10) / 10,
        variance: Math.round(variance * 10) / 10,
        trend,
      } as SeasonalPattern;
    }).sort((a, b) => weekdayLabels.indexOf(a.period) - weekdayLabels.indexOf(b.period));
  };

  // Gerar insights preditivos
  const generatePredictiveInsights = (latest: TrendData, metrics: TrendMetrics | null): PredictiveInsight[] => {
    const total = latest.clients || 1;
    const baseConfidence = metrics ? (metrics.volatility < 5 ? 'high' : metrics.volatility < 12 ? 'medium' : 'low') : 'medium';

    const entries = [
      { category: 'Ótimo', value: latest.excellent },
      { category: 'Estável', value: latest.stable },
      { category: 'Atenção', value: latest.warning },
      { category: 'Crítico', value: latest.critical },
    ];

    return entries
      .map(entry => ({
        category: entry.category,
        probability: entry.value / total,
        timeframe: 'Próximo ciclo',
        confidence: baseConfidence as 'high' | 'medium' | 'low',
      }))
      .sort((a, b) => b.probability - a.probability);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const data = await loadTemporalSeries();
        if (cancelled) return;
        const metrics = calculateTrendMetrics(data);
        const patterns = calculateSeasonalPatterns(data);
        const insights = data.length > 0 ? generatePredictiveInsights(data[data.length - 1], metrics) : [];

        setTrendData(data);
        setTrendMetrics(metrics);
        setSeasonalPatterns(patterns);
        setPredictiveInsights(insights);
      } catch (e) {
        if (!cancelled) setError('Não foi possível carregar a série temporal.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filteredClients, timeframe, selectedPlanner, manager, mediator, leader]);

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'improving':
        return isDarkMode ? 'text-green-300' : 'text-green-600';
      case 'declining':
        return isDarkMode ? 'text-red-300' : 'text-red-600';
      default:
        return isDarkMode ? 'text-blue-300' : 'text-blue-600';
    }
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="h-5 w-5 text-green-500" />;
      case 'declining':
        return <TrendingDown className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-blue-500" />;
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high':
        return isDarkMode ? 'bg-green-900 text-green-300' : 'bg-green-100 text-green-800';
      case 'medium':
        return isDarkMode ? 'bg-yellow-900 text-yellow-300' : 'bg-yellow-100 text-yellow-800';
      case 'low':
        return isDarkMode ? 'bg-red-900 text-red-300' : 'bg-red-100 text-red-800';
      default:
        return isDarkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Carregando análise de tendências...</p>
        </div>
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!loading && trendData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-500">Sem dados no período selecionado.</p>
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
            Análise de Tendências Avançadas
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Análise preditiva e padrões de evolução do Health Score
            {selectedPlanner !== "all" && ` - ${selectedPlanner}`}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant={timeframe === '7d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeframe('7d')}
          >
            7 dias
          </Button>
          <Button
            variant={timeframe === '30d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeframe('30d')}
          >
            30 dias
          </Button>
          <Button
            variant={timeframe === '90d' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTimeframe('90d')}
          >
            90 dias
          </Button>
        </div>
      </div>

      {/* Métricas de Tendência */}
      {trendMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                {getTrendIcon(trendMetrics.overallTrend)}
                <div>
                  <div className={`text-lg font-bold ${getTrendColor(trendMetrics.overallTrend)}`}>
                    {trendMetrics.overallTrend === 'improving' ? 'Melhorando' : 
                     trendMetrics.overallTrend === 'declining' ? 'Piorando' : 'Estável'}
                  </div>
                  <div className="text-sm text-muted-foreground">Tendência Geral</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                <div>
                  <div className="text-lg font-bold">{trendMetrics.trendStrength}</div>
                  <div className="text-sm text-muted-foreground">Força da Tendência</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-lg font-bold">{trendMetrics.volatility}</div>
                  <div className="text-sm text-muted-foreground">Volatilidade</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-lg font-bold">{trendMetrics.momentum}</div>
                  <div className="text-sm text-muted-foreground">Momentum</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-purple-500" />
                <div>
                  <div className="text-lg font-bold">{trendMetrics.acceleration}</div>
                  <div className="text-sm text-muted-foreground">Aceleração</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gráfico de Tendência */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Evolução do Health Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
              <XAxis 
                dataKey="date" 
                stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
                fontSize={12}
              />
              <YAxis 
                stroke={isDarkMode ? '#9ca3af' : '#6b7280'}
                fontSize={12}
                domain={[0, 200]}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                  border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                  borderRadius: '8px',
                  color: isDarkMode ? '#f9fafb' : '#111827'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="score" 
                stroke="#8b5cf6" 
                fill="url(#colorGradient)" 
                strokeWidth={2}
              />
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Padrões Sazonais e Insights Preditivos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Padrões Sazonais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {seasonalPatterns.map((pattern, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-background/50">
                  <div>
                    <div className="font-medium">{pattern.period}</div>
                    <div className="text-sm text-muted-foreground">
                      Variância: {pattern.variance}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">{pattern.averageScore}</div>
                    <div className="flex items-center gap-1">
                      {pattern.trend === 'up' ? (
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      ) : pattern.trend === 'down' ? (
                        <TrendingDown className="h-4 w-4 text-red-500" />
                      ) : (
                        <Activity className="h-4 w-4 text-blue-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {pattern.trend === 'up' ? 'Crescendo' : 
                         pattern.trend === 'down' ? 'Decrescendo' : 'Estável'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Insights Preditivos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {predictiveInsights.map((insight, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg border bg-background/50">
                  <div>
                    <div className="font-medium">{insight.category}</div>
                    <div className="text-sm text-muted-foreground">
                      {insight.timeframe}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold">
                      {Math.round(insight.probability * 100)}%
                    </div>
                    <Badge className={getConfidenceColor(insight.confidence)}>
                      {insight.confidence === 'high' ? 'Alta' : 
                       insight.confidence === 'medium' ? 'Média' : 'Baixa'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição de Categorias ao Longo do Tempo */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Distribuição de Categorias
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trendData}>
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
              <Bar dataKey="excellent" stackId="stack" name="Ótimo" fill="#10b981" />
              <Bar dataKey="stable" stackId="stack" name="Estável" fill="#3b82f6" />
              <Bar dataKey="warning" stackId="stack" name="Atenção" fill="#f59e0b" />
              <Bar dataKey="critical" stackId="stack" name="Crítico" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdvancedTrends;
