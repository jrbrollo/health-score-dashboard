import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Target, Award, AlertTriangle, Users, Lightbulb } from "lucide-react";
import { Client, Planner, HealthCategory } from "@/types/client";
import { calculateHealthScore } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";

interface AnalyticsViewProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
}

const planners: Planner[] = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraão", "Murilo", "Felipe", "Hélio", "Vinícius"];

export function AnalyticsView({ clients, selectedPlanner }: AnalyticsViewProps) {
  // Calculate comprehensive analytics
  const analytics = useMemo(() => {
    const filteredClients = selectedPlanner === "all" ? clients : clients.filter(c => c.planner === selectedPlanner);
    const healthScores = filteredClients.map(client => calculateHealthScore(client));
    
    // Planner rankings
    const plannerRankings = planners.map(planner => {
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

    // Health distribution
    const healthDistribution = [
      { name: "Ótimo", value: healthScores.filter(s => s.category === "Ótimo").length, color: "hsl(var(--health-excellent))" },
      { name: "Estável", value: healthScores.filter(s => s.category === "Estável").length, color: "hsl(var(--health-stable))" },
      { name: "Atenção", value: healthScores.filter(s => s.category === "Atenção").length, color: "hsl(var(--health-warning))" },
      { name: "Crítico", value: healthScores.filter(s => s.category === "Crítico").length, color: "hsl(var(--health-critical))" }
    ];

    // Pillar analysis
    const pillarAnalysis = [
      {
        name: "Engajamento Reuniões",
        avg: Math.round(healthScores.reduce((sum, s) => sum + s.breakdown.meetingEngagement, 0) / healthScores.length || 0),
        max: 40,
        impact: "Alto"
      },
      {
        name: "Uso do App",
        avg: Math.round(healthScores.reduce((sum, s) => sum + s.breakdown.appUsage, 0) / healthScores.length || 0),
        max: 30,
        impact: "Médio"
      },
      {
        name: "Status Pagamento",
        avg: Math.round(healthScores.reduce((sum, s) => sum + s.breakdown.paymentStatus, 0) / healthScores.length || 0),
        max: 30,
        impact: "Alto"
      },
      {
        name: "Ecossistema",
        avg: Math.round(healthScores.reduce((sum, s) => sum + s.breakdown.ecosystemEngagement, 0) / healthScores.length || 0),
        max: 15,
        impact: "Baixo"
      },
      {
        name: "NPS",
        avg: Math.round(healthScores.reduce((sum, s) => sum + s.breakdown.npsScore, 0) / healthScores.length || 0),
        max: 15,
        impact: "Médio"
      }
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
        <h2 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Análise Avançada - {selectedPlanner === "all" ? "Equipe Completa" : selectedPlanner}
        </h2>
        <p className="text-muted-foreground mt-2">
          Insights detalhados e recomendações estratégicas
        </p>
      </div>

      {/* Key Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {analytics.insights.map((insight, index) => (
          <Card key={index} className={`bg-gradient-to-br ${insight.type === "positive" ? "from-health-excellent-bg to-health-excellent-bg/50" : insight.type === "negative" ? "from-health-critical-bg to-health-critical-bg/50" : "from-health-warning-bg to-health-warning-bg/50"} border-0 shadow-[var(--shadow-card)]`}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                {insight.type === "positive" ? (
                  <TrendingUp className="h-5 w-5 text-health-excellent" />
                ) : insight.type === "negative" ? (
                  <TrendingDown className="h-5 w-5 text-health-critical" />
                ) : (
                  <Lightbulb className="h-5 w-5 text-health-warning" />
                )}
                <CardTitle className="text-lg">{insight.title}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm mb-3">{insight.description}</p>
              <Badge variant="outline" className="text-xs">
                Impacto: +{insight.impact} pontos
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Health Score Distribution */}
        <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
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
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
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
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Pillar Performance */}
        <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart className="h-5 w-5" />
              Performance por Pilar
            </CardTitle>
            <CardDescription>Análise detalhada dos 5 pilares</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                avg: { label: "Média Atual", color: "hsl(var(--primary))" },
                max: { label: "Máximo Possível", color: "hsl(var(--muted))" }
              }}
              className="h-[300px]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.pillarAnalysis} layout="horizontal">
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="max" fill="hsl(var(--muted))" opacity={0.3} />
                  <Bar dataKey="avg" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Planner Rankings */}
      {selectedPlanner === "all" && (
        <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
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
                      <Progress value={(planner.avgScore / 135) * 100} className="w-20 h-2" />
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
      <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
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
            {analytics.insights.filter(i => i.type === "action").slice(0, 3).map((action, index) => (
              <div key={index} className="flex items-start gap-4 p-4 rounded-lg border bg-health-warning-bg/30">
                <div className="w-6 h-6 rounded-full bg-health-warning text-health-warning-foreground flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <h4 className="font-medium mb-1">{action.title}</h4>
                  <p className="text-sm text-muted-foreground mb-2">{action.description}</p>
                  <Badge variant="outline" className="text-xs">
                    ROI: +{action.impact} pontos médios
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function generateInsights(clients: Client[], healthScores: any[], pillarAnalysis: any[], selectedPlanner: string) {
  const insights = [];
  
  // App usage insight
  const lowAppUsage = clients.filter(c => c.appUsage === "Sem acesso/categorização (30+ dias)").length;
  if (lowAppUsage > 0) {
    insights.push({
      type: "action",
      title: "Ativar Uso do App/Planilha",
      description: `${lowAppUsage} clientes não usam o app há 30+ dias. Reativar pode gerar +30 pontos por cliente.`,
      impact: 30
    });
  }

  // Meeting engagement
  const noScheduledMeetings = clients.filter(c => !c.hasScheduledMeeting).length;
  if (noScheduledMeetings > 0) {
    insights.push({
      type: "action", 
      title: "Agendar Reuniões Futuras",
      description: `${noScheduledMeetings} clientes sem reunião agendada. Agendar pode gerar +10 pontos por cliente.`,
      impact: 10
    });
  }

  // Payment status
  const latePayments = clients.filter(c => c.paymentStatus.includes("atraso")).length;
  if (latePayments > 0) {
    insights.push({
      type: "negative",
      title: "Atenção aos Pagamentos",
      description: `${latePayments} clientes com parcelas em atraso impactando negativamente o Health Score.`,
      impact: 15
    });
  }

  // Positive insight
  const promoters = clients.filter(c => c.npsScore === "Promotor (9-10)").length;
  if (promoters > 0) {
    insights.push({
      type: "positive",
      title: "Base de Promotores Forte",
      description: `${promoters} clientes são promotores. Aproveitar para gerar indicações (+5 pontos).`,
      impact: 5
    });
  }

  // Ecosystem usage
  const noEcosystem = clients.filter(c => c.ecosystemUsage === "Não usou").length;
  if (noEcosystem > 0) {
    insights.push({
      type: "action",
      title: "Expandir Uso do Ecossistema",
      description: `${noEcosystem} clientes não usam outras áreas. Apresentar pode gerar +5-10 pontos.`,
      impact: 7
    });
  }

  return insights;
}