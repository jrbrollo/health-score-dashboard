import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Target, Award, AlertTriangle, Users, Lightbulb, BarChart, X } from "lucide-react";
import { Client, HealthCategory } from "@/types/client";
import { uniqueById } from "@/lib/filters";
import { calculateHealthScore, getHealthCategory } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { AnalysisInfoTooltip } from "./AnalysisInfoTooltip";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { Button } from "./ui/button";
import { toast } from "@/hooks/use-toast";

interface AnalyticsViewProps {
  clients: Client[];
  selectedPlanner?: string | null;
  isDarkMode?: boolean;
}

// planners derivam dos clientes recebidos

interface OpportunityClient {
  client: Client;
  currentScore: number;
  potentialScore: number;
  pointsGain: number;
  currentCategory: string;
  potentialCategory: string;
}

export function AnalyticsView({ clients, selectedPlanner = null, isDarkMode = false }: AnalyticsViewProps) {
  const [openOpportunityDrawer, setOpenOpportunityDrawer] = useState<string | null>(null);
  const [opportunityTitle, setOpportunityTitle] = useState<string>('');
  const [opportunityClients, setOpportunityClients] = useState<OpportunityClient[]>([]);

  // Calculate comprehensive analytics
  const analytics = useMemo(() => {
    const filteredClients = uniqueById(!selectedPlanner ? clients : clients.filter(c => c.planner === selectedPlanner));
    const healthScores = filteredClients.map(client => calculateHealthScore(client));
    
    // Planner rankings (dinâmico)
    const dynamicPlanners = Array.from(new Set(clients.filter(c => c.planner && c.planner !== '0').map(c => c.planner)));
    const plannerRankings = dynamicPlanners.map(planner => {
      const plannerClients = clients.filter(c => c.planner === planner);
      const plannerScores = plannerClients.map(c => calculateHealthScore(c));
      const avgScore = plannerScores.length > 0 
        ? Math.round(plannerScores.reduce((sum, s) => sum + s.score, 0) / plannerScores.length)
        : 0;
      
      return {
        planner,
        avgScore,
        clientCount: plannerClients.length,
        category: avgScore >= 100 ? "Ótimo" : avgScore >= 60 ? "Estável" : avgScore >= 35 ? "Atenção" : "Crítico"
      };
    }).filter(p => p.clientCount > 0).sort((a, b) => b.avgScore - a.avgScore);

    // Health distribution with simple colors that work in both light and dark modes
    const healthDistribution = [
      { name: "Ótimo", value: healthScores.filter(s => s.category === "Ótimo").length, color: "#10b981" }, // green-500
      { name: "Estável", value: healthScores.filter(s => s.category === "Estável").length, color: "#3b82f6" }, // blue-500
      { name: "Atenção", value: healthScores.filter(s => s.category === "Atenção").length, color: "#f59e0b" }, // amber-500
      { name: "Crítico", value: healthScores.filter(s => s.category === "Crítico").length, color: "#ef4444" } // red-500
    ];

    // Pillar analysis (v3): NPS (20), Indicação (10), Inadimplência (40), Cross Sell (15), Tenure (15)
    const avgFrom = (key: keyof typeof healthScores[0]['breakdown']) => {
      if (healthScores.length === 0) return 0;
      const total = healthScores.reduce((sum, s) => sum + (s.breakdown as any)[key], 0);
      return total / healthScores.length;
    };

    const pillarAnalysis = [
      { name: "NPS", avg: avgFrom('nps'), max: 20, impact: "Médio" },
      { name: "Indicação", avg: avgFrom('referral'), max: 10, impact: "Baixo" },
      { name: "Pagamentos", avg: avgFrom('payment'), max: 40, impact: "Alto" },
      { name: "Cross Sell", avg: avgFrom('crossSell'), max: 15, impact: "Médio" },
      { name: "Tempo de Relacionamento", avg: avgFrom('tenure'), max: 15, impact: "Médio" },
    ];

    // Generate insights
    const insights = generateInsights(filteredClients, healthScores, pillarAnalysis, selectedPlanner);
    
    return {
      plannerRankings,
      healthDistribution,
      pillarAnalysis,
      insights,
      totalClients: filteredClients.length,
      avgScore: Math.round(healthScores.reduce((sum, s) => sum + s.score, 0) / healthScores.length || 0)
    };
  }, [clients, selectedPlanner]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2">
          <h2 className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Análise de Indicadores - {selectedPlanner ? selectedPlanner : "Equipe Filtrada"}
          </h2>
          <AnalysisInfoTooltip
            title="Análise de Indicadores"
            description="Esta seção oferece uma análise detalhada dos indicadores de saúde dos clientes, incluindo rankings de planejadores, distribuição por categorias e análise dos pilares do Health Score."
            tips={[
              "Use o ranking de planejadores para identificar os profissionais com melhor desempenho",
              "Analise a distribuição por categorias para entender a composição da carteira",
              "Monitore os pilares (NPS, Indicação, Pagamentos, Cross Sell, Tenure) para identificar pontos fortes e fracos",
              "Preste atenção aos insights gerados automaticamente para ações recomendadas"
            ]}
          />
        </div>
        <p className="text-muted-foreground mt-2">
          Insights detalhados e recomendações estratégicas
        </p>
      </div>

      {/* Key Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {analytics.insights.map((insight, index) => {
          const getInsightIcon = (type: string) => {
            if (type === "positive") return "✨";
            if (type === "negative") return "⚠️";
            return "💡";
          };
          
          const getInsightAccent = (type: string) => {
            if (type === "positive") return "border-l-4 border-l-green-500";
            if (type === "negative") return "border-l-4 border-l-red-500";
            return "border-l-4 border-l-blue-500";
          };

          const handleInsightClick = () => {
            try {
              const filteredClients = uniqueById(!selectedPlanner ? clients : clients.filter(c => c.planner === selectedPlanner));
              const opportunities = calculateOpportunities(filteredClients, insight.title, insight.type, insight.impact);
              
              if (opportunities.length > 0) {
                setOpportunityTitle(getOpportunityTitle(insight.title));
                setOpportunityClients(opportunities);
                setOpenOpportunityDrawer(insight.title);
              } else {
                toast({
                  title: 'Nenhuma oportunidade encontrada',
                  description: 'Não há clientes que se enquadram nesta oportunidade no momento.',
                  variant: 'default',
                });
              }
            } catch (error: any) {
              console.error('Erro ao calcular oportunidades:', error);
              toast({
                title: 'Erro ao carregar oportunidades',
                description: 'Não foi possível calcular as oportunidades. Tente novamente.',
                variant: 'destructive',
              });
            }
          };
          
          return (
            <Card 
              key={index} 
              onClick={handleInsightClick}
              className={`animate-fade-in-up animate-delay-${(index + 1) * 100} ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'} ${getInsightAccent(insight.type)} cursor-pointer`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="text-2xl">
                    {getInsightIcon(insight.type)}
                  </div>
                  <CardTitle className="text-sm font-medium">
                    {insight.title}
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-xs font-medium">
                  +{insight.impact} pts
                </Badge>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {insight.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health Score Distribution */}
        <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Distribuição Health Score
            </CardTitle>
            <CardDescription>Visão geral da saúde da carteira</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                value: { label: "Clientes", color: "hsl(var(--primary))" }
              }}
              className="h-[300px] w-full"
            >
              <PieChart width={400} height={300}>
                <Pie
                  data={analytics.healthDistribution}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {analytics.healthDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Pillar Performance */}
        <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Performance por Pilar
            </CardTitle>
            <CardDescription>Análise detalhada dos 5 pilares</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.pillarAnalysis.map((pillar, index) => {
                const percentage = pillar.max > 0 ? (pillar.avg / pillar.max) * 100 : 0;
                const getColorClass = (pct: number) => {
                  if (pct >= 80) return "bg-green-500";
                  if (pct >= 60) return "bg-blue-500";
                  if (pct >= 40) return "bg-yellow-500";
                  return "bg-red-500";
                };
                
                return (
                  <div key={index} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm">{pillar.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {pillar.avg.toFixed(1)} / {pillar.max}
                        </span>
                        <Badge variant={percentage >= 70 ? "default" : percentage >= 50 ? "secondary" : "destructive"}>
                          {percentage.toFixed(0)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${getColorClass(percentage)}`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Planner Rankings */}
      {selectedPlanner === "all" && (
        <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Ranking de Planejadores
            </CardTitle>
            <CardDescription>Performance ordenada por Health Score médio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.plannerRankings.map((planner, index) => (
                <div key={planner.planner} className="flex items-center justify-between p-4 rounded-lg border bg-background/50">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? "bg-health-excellent text-health-excellent-foreground" :
                      index === 1 ? "bg-health-stable text-health-stable-foreground" :
                      index === 2 ? "bg-health-warning text-health-warning-foreground" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium">{planner.planner}</div>
                      <div className="text-sm text-muted-foreground">
                        {planner.clientCount} {planner.clientCount === 1 ? 'cliente' : 'clientes'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-semibold">{planner.avgScore}</div>
                      <Progress value={planner.avgScore} className="w-20 h-2" />
                    </div>
                    <HealthScoreBadge
                      category={planner.category as HealthCategory}
                      score={planner.avgScore}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Items */}
      <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Plano de Ação Prioritário
          </CardTitle>
          <CardDescription>
            Ações com maior potencial de impacto no Health Score
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.insights.filter(i => i.type === "action").slice(0, 3).map((action, index) => {
              const getActionIcon = (title: string) => {
                if (title.includes("App") || title.includes("Planilha")) return "📱";
                if (title.includes("Reuniões") || title.includes("Reunião")) return "📅";
                if (title.includes("Pagamento")) return "💳";
                if (title.includes("Promotores")) return "⭐";
                if (title.includes("Ecossistema")) return "🔗";
                return "🎯";
              };
              
              const getPriorityBadge = (index: number) => {
                if (index === 0) return "bg-red-100 text-red-800 border-red-300";
                if (index === 1) return "bg-yellow-100 text-yellow-800 border-yellow-300";
                return "bg-blue-100 text-blue-800 border-blue-300";
              };

              const handleActionClick = () => {
                try {
                  const filteredClients = uniqueById(!selectedPlanner ? clients : clients.filter(c => c.planner === selectedPlanner));
                  const opportunities = calculateOpportunities(filteredClients, action.title, action.type, action.impact);
                  
                  if (opportunities.length > 0) {
                    setOpportunityTitle(getOpportunityTitle(action.title));
                    setOpportunityClients(opportunities);
                    setOpenOpportunityDrawer(action.title);
                  } else {
                    toast({
                      title: 'Nenhuma oportunidade encontrada',
                      description: 'Não há clientes que se enquadram nesta oportunidade no momento.',
                      variant: 'default',
                    });
                  }
                } catch (error: any) {
                  console.error('Erro ao calcular oportunidades:', error);
                  toast({
                    title: 'Erro ao carregar oportunidades',
                    description: 'Não foi possível calcular as oportunidades. Tente novamente.',
                    variant: 'destructive',
                  });
                }
              };
              
              return (
                <Card 
                  key={index} 
                  onClick={handleActionClick}
                  className={`animate-fade-in-up animate-delay-${(index + 1) * 100} ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'} border-l-4 ${index === 0 ? 'border-l-red-500' : index === 1 ? 'border-l-yellow-500' : 'border-l-blue-500'} cursor-pointer`}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">
                        {getActionIcon(action.title)}
                      </div>
                      <CardTitle className="text-sm font-medium">
                        {action.title}
                      </CardTitle>
                    </div>
                    <Badge className={`text-xs font-medium px-2 py-1 ${getPriorityBadge(index)} border`}>
                      #{index + 1}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      {action.description}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      💰 Impacto: +{action.impact} pontos
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Drawer de Oportunidades */}
      <Drawer open={!!openOpportunityDrawer} onOpenChange={(open) => !open && setOpenOpportunityDrawer(null)}>
        <DrawerContent className={`max-h-[90vh] ${isDarkMode ? 'gradient-bg-dark' : 'bg-white'}`}>
          <div className="max-w-4xl mx-auto w-full p-6 overflow-y-auto">
            <DrawerHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <DrawerTitle className={`text-2xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {opportunityTitle}
                  </DrawerTitle>
                  <DrawerDescription className={`mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {opportunityClients.length} {opportunityClients.length === 1 ? 'oportunidade encontrada' : 'oportunidades encontradas'}
                  </DrawerDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setOpenOpportunityDrawer(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DrawerHeader>

            <div className="mt-6 space-y-3">
              {opportunityClients.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p>Nenhuma oportunidade encontrada.</p>
                </div>
              ) : (
                opportunityClients.map((opp) => {
                  return (
                    <Card 
                      key={opp.client.id} 
                      className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div>
                              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                {opp.client.name}
                              </h3>
                              <div className="flex items-center gap-3 mt-2">
                                <HealthScoreBadge 
                                  score={opp.currentScore} 
                                  category={opp.currentCategory as HealthCategory}
                                />
                                {opp.client.planner && (
                                  <Badge variant="outline" className="text-xs">
                                    {opp.client.planner}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className={`text-sm font-semibold ${isDarkMode ? 'text-green-400' : 'text-green-600'}`}>
                                +{opp.pointsGain} pts
                              </div>
                              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                {opp.currentScore} → {opp.potentialScore}
                              </div>
                              {opp.currentCategory !== opp.potentialCategory && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {opp.currentCategory} → {opp.potentialCategory}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function generateInsights(clients: Client[], healthScores: any[], pillarAnalysis: any[], selectedPlanner?: string | null) {
  const insights = [];
  
  // v3 insights
  const overdue2 = clients.filter(c => (c.overdueInstallments ?? 0) >= 2 && (c.overdueInstallments ?? 0) < 3).length;
  if (overdue2 > 0) {
    insights.push({
      type: "negative",
      title: "Risco de Inadimplência Elevado",
      description: `${overdue2} clientes com 2 parcelas em atraso. Aja antes de virar 3+ (score zera).`,
      impact: 20
    });
  }

  const overdue1_30plus = clients.filter(c => (c.overdueInstallments ?? 0) === 1 && (c.overdueDays ?? 0) > 30).length;
  if (overdue1_30plus > 0) {
    insights.push({
      type: "negative",
      title: "1 Parcela >30 dias",
      description: `${overdue1_30plus} clientes com 1 parcela >30 dias. Regularizar evita perda de até 20 pontos.`,
      impact: 20
    });
  }

  const noNps = clients.filter(c => c.npsScoreV3 === null || c.npsScoreV3 === undefined).length;
  if (noNps > 0) {
    insights.push({
      type: "action",
      title: "Coletar NPS Pendente",
      description: `${noNps} clientes sem nota de NPS. Coletar pode elevar até +20 pontos.`,
      impact: 20
    });
  }

  const promotersV3 = clients.filter(c => (c.npsScoreV3 ?? -1) >= 9).length;
  if (promotersV3 > 0) {
    insights.push({
      type: "positive",
      title: "Ativar Indicações de Promotores",
      description: `${promotersV3} promotores. Incentive indicações (+10 pontos por cliente).`,
      impact: 10
    });
  }

  const lowCross = clients.filter(c => (c.crossSellCount ?? 0) === 0).length;
  if (lowCross > 0) {
    insights.push({
      type: "action",
      title: "Oportunidade de Cross Sell",
      description: `${lowCross} clientes sem produtos adicionais. Oferecer pode render até +15 pontos.`,
      impact: 15
    });
  }

  // Tempo de Relacionamento (insight informativo baseado no pilar Tenure)
  const tenureDefined = clients.filter(c => c.monthsSinceClosing !== null && c.monthsSinceClosing !== undefined);
  if (tenureDefined.length > 0) {
    const t0_3 = tenureDefined.filter(c => (c.monthsSinceClosing as number) <= 3).length;
    const t4_6 = tenureDefined.filter(c => (c.monthsSinceClosing as number) > 3 && (c.monthsSinceClosing as number) <= 6).length;
    const t7_12 = tenureDefined.filter(c => (c.monthsSinceClosing as number) > 6 && (c.monthsSinceClosing as number) <= 12).length;
    const t13_24 = tenureDefined.filter(c => (c.monthsSinceClosing as number) > 12 && (c.monthsSinceClosing as number) <= 24).length;
    const t25p = tenureDefined.filter(c => (c.monthsSinceClosing as number) > 24).length;
    insights.push({
      type: "info",
      title: "Tempo de Relacionamento",
      description: `${t0_3} até 3m • ${t4_6} de 4‑6m • ${t7_12} de 7‑12m • ${t13_24} de 13‑24m • ${t25p} 25m+`,
      impact: 10
    });
  }

  return insights;
}

// Função para calcular oportunidades de clientes baseado no tipo de insight
function calculateOpportunities(
  clients: Client[],
  insightTitle: string,
  insightType: string,
  insightImpact: number
): OpportunityClient[] {
  const opportunities: OpportunityClient[] = [];

  clients.forEach(client => {
    const currentScore = calculateHealthScore(client);
    let potentialScore = currentScore.score;
    let pointsGain = 0;

    // Calcular impacto baseado no tipo de insight
    if (insightTitle.includes("Coletar NPS Pendente")) {
      if (client.npsScoreV3 === null || client.npsScoreV3 === undefined) {
        // Cliente sem NPS já recebe 10 pontos (neutro padrão)
        // Se coletar e for promotor (9-10), ganha +10 pontos (de 10 para 20)
        // Vamos calcular o melhor cenário (promotor = +10 pontos)
        const currentNpsPoints = currentScore.breakdown.nps; // Já é 10 para null
        const potentialNpsPoints = 20; // Melhor cenário (promotor)
        pointsGain = potentialNpsPoints - currentNpsPoints;
        potentialScore = currentScore.score + pointsGain;
        // Garantir que não fica negativo
        if (potentialScore < 0) potentialScore = 0;
      }
    } else if (insightTitle.includes("Ativar Indicações de Promotores")) {
      if ((client.npsScoreV3 ?? -1) >= 9 && !client.hasNpsReferral) {
        // Se ativar indicação de promotor, ganha +10 pontos
        pointsGain = 10;
        potentialScore = currentScore.score + pointsGain;
      }
    } else if (insightTitle.includes("Oportunidade de Cross Sell")) {
      if ((client.crossSellCount ?? 0) === 0) {
        // Cliente com 0 produtos recebe 0 pontos no pilar Cross Sell
        // Se adicionar 3+ produtos, ganha +15 pontos (melhor cenário)
        const currentCrossSellPoints = currentScore.breakdown.crossSell; // Já é 0 para count = 0
        const potentialCrossSellPoints = 15; // 3+ produtos
        pointsGain = potentialCrossSellPoints - currentCrossSellPoints;
        potentialScore = currentScore.score + pointsGain;
        // Garantir que não fica negativo
        if (potentialScore < 0) potentialScore = 0;
      }
    } else if (insightTitle.includes("Risco de Inadimplência Elevado")) {
      if ((client.overdueInstallments ?? 0) >= 2 && (client.overdueInstallments ?? 0) < 3) {
        // Se regularizar antes de virar 3+, evita perder pontos
        // Atualmente está perdendo pontos por ter 2 parcelas
        // Se regularizar, volta para adimplente (+40 pontos)
        const currentPaymentPoints = currentScore.breakdown.payment;
        const potentialPaymentPoints = 40; // Adimplente
        pointsGain = potentialPaymentPoints - currentPaymentPoints;
        potentialScore = currentScore.score + pointsGain;
        // Garantir que não fica negativo
        if (potentialScore < 0) potentialScore = 0;
      }
    } else if (insightTitle.includes("1 Parcela >30 dias")) {
      if ((client.overdueInstallments ?? 0) === 1 && (client.overdueDays ?? 0) > 30) {
        // Se regularizar, pode melhorar o score de pagamento
        const currentPaymentPoints = currentScore.breakdown.payment;
        const potentialPaymentPoints = 40; // Adimplente
        pointsGain = potentialPaymentPoints - currentPaymentPoints;
        potentialScore = currentScore.score + pointsGain;
        // Garantir que não fica negativo
        if (potentialScore < 0) potentialScore = 0;
      }
    }

    // Só adicionar se houver ganho de pontos
    if (pointsGain > 0) {
      // Usar a mesma função getHealthCategory para garantir consistência
      const potentialCategory = getHealthCategory(Math.max(0, potentialScore));
      
      opportunities.push({
        client,
        currentScore: currentScore.score,
        potentialScore: Math.max(0, potentialScore), // Garantir que não seja negativo
        pointsGain,
        currentCategory: currentScore.category,
        potentialCategory
      });
    }
  });

  // Ordenar por maior ganho de pontos
  return opportunities.sort((a, b) => b.pointsGain - a.pointsGain);
}

// Função para obter título da oportunidade baseado no insight
function getOpportunityTitle(insightTitle: string): string {
  if (insightTitle.includes("Coletar NPS")) {
    return "Oportunidades de Coletar NPS";
  } else if (insightTitle.includes("Ativar Indicações")) {
    return "Oportunidades de Ativar Indicações";
  } else if (insightTitle.includes("Cross Sell")) {
    return "Oportunidades de Cross Sell";
  } else if (insightTitle.includes("Inadimplência")) {
    return "Oportunidades de Regularizar Inadimplência";
  } else if (insightTitle.includes("1 Parcela")) {
    return "Oportunidades de Regularizar Pagamento";
  }
  return `Oportunidades de ${insightTitle}`;
}