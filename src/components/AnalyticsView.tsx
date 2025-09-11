import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Target, Award, AlertTriangle, Users, Lightbulb, BarChart } from "lucide-react";
import { Client, Planner, HealthCategory } from "@/types/client";
import { calculateHealthScore } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";

interface AnalyticsViewProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
}

const planners: Planner[] = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraao", "Murilo", "Felipe", "Helio", "Vinícius"];

export function AnalyticsView({ clients, selectedPlanner, isDarkMode = false }: AnalyticsViewProps) {
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

    // Health distribution with simple colors that work in both light and dark modes
    const healthDistribution = [
      { name: "Ótimo", value: healthScores.filter(s => s.category === "Ótimo").length, color: "#10b981" }, // green-500
      { name: "Estável", value: healthScores.filter(s => s.category === "Estável").length, color: "#3b82f6" }, // blue-500
      { name: "Atenção", value: healthScores.filter(s => s.category === "Atenção").length, color: "#f59e0b" }, // amber-500
      { name: "Crítico", value: healthScores.filter(s => s.category === "Crítico").length, color: "#ef4444" } // red-500
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
          
          
          return (
            <Card key={index} className={`animate-fade-in-up animate-delay-${(index + 1) * 100} ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'} ${getInsightAccent(insight.type)}`}>
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
              
              return (
                <Card key={index} className={`animate-fade-in-up animate-delay-${(index + 1) * 100} ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'} border-l-4 ${index === 0 ? 'border-l-red-500' : index === 1 ? 'border-l-yellow-500' : 'border-l-blue-500'}`}>
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