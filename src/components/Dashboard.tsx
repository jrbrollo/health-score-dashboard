import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Users, 
  TrendingUp, 
  AlertCircle, 
  Award, 
  Filter, 
  BarChart3 
} from "lucide-react";
import { Client, Planner, HealthScore } from "@/types/client";
import { calculateHealthScore, getHealthCategoryColor } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { AnalyticsView } from "./AnalyticsView";

interface DashboardProps {
  clients: Client[];
  onAddClient: () => void;
}

const planners: Planner[] = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraão", "Murilo", "Felipe", "Hélio", "Vinícius"];

export function Dashboard({ clients, onAddClient }: DashboardProps) {
  const [selectedPlanner, setSelectedPlanner] = useState<Planner | "all">("all");

  // Filter clients by selected planner
  const filteredClients = useMemo(() => {
    if (selectedPlanner === "all") return clients;
    return clients.filter(client => client.planner === selectedPlanner);
  }, [clients, selectedPlanner]);

  // Calculate health scores for filtered clients
  const healthScores = useMemo(() => {
    return filteredClients.map(client => calculateHealthScore(client));
  }, [filteredClients]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = healthScores.length;
    const excellent = healthScores.filter(score => score.category === "Ótimo").length;
    const stable = healthScores.filter(score => score.category === "Estável").length;
    const warning = healthScores.filter(score => score.category === "Atenção").length;
    const critical = healthScores.filter(score => score.category === "Crítico").length;
    
    const averageScore = total > 0 
      ? Math.round(healthScores.reduce((sum, score) => sum + score.score, 0) / total)
      : 0;

    return { total, excellent, stable, warning, critical, averageScore };
  }, [healthScores]);

  // Group clients by planner for team view
  const plannerStats = useMemo(() => {
    if (selectedPlanner !== "all") return [];
    
    return planners.map(planner => {
      const plannerClients = clients.filter(client => client.planner === planner);
      const plannerScores = plannerClients.map(client => calculateHealthScore(client));
      const avgScore = plannerScores.length > 0 
        ? Math.round(plannerScores.reduce((sum, score) => sum + score.score, 0) / plannerScores.length)
        : 0;
      
      return {
        planner,
        clientCount: plannerClients.length,
        averageScore: avgScore,
        category: avgScore >= 100 ? "Ótimo" : avgScore >= 60 ? "Estável" : avgScore >= 35 ? "Atenção" : "Crítico"
      };
    }).filter(stat => stat.clientCount > 0);
  }, [clients, selectedPlanner]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Health Score Dashboard
            </h1>
            <p className="text-muted-foreground text-lg mt-2">
              Análise da carteira de clientes - Braúna
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <Select value={selectedPlanner} onValueChange={(value: Planner | "all") => setSelectedPlanner(value)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">🎯 Visão Geral da Equipe</SelectItem>
                {planners.map(planner => (
                  <SelectItem key={planner} value={planner}>
                    👤 {planner}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              onClick={onAddClient} 
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Análise Avançada
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-xs text-muted-foreground">
                    {selectedPlanner === "all" ? "em toda equipe" : `de ${selectedPlanner}`}
                  </p>
                </CardContent>
              </Card>

              <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Score Médio</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.averageScore}</div>
                  <HealthScoreBadge
                    category={stats.averageScore >= 100 ? "Ótimo" : stats.averageScore >= 60 ? "Estável" : stats.averageScore >= 35 ? "Atenção" : "Crítico"}
                    score={stats.averageScore}
                    className="mt-1"
                  />
                </CardContent>
              </Card>

              <Card className="bg-health-excellent-bg border border-health-excellent/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-health-excellent">Ótimos</CardTitle>
                  <Award className="h-4 w-4 text-health-excellent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-health-excellent">{stats.excellent}</div>
                  <p className="text-xs text-health-excellent/70">100+ pontos</p>
                </CardContent>
              </Card>

              <Card className="bg-health-stable-bg border border-health-stable/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-health-stable">Estáveis</CardTitle>
                  <TrendingUp className="h-4 w-4 text-health-stable" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-health-stable">{stats.stable}</div>
                  <p className="text-xs text-health-stable/70">60-99 pontos</p>
                </CardContent>
              </Card>

              <Card className="bg-health-critical-bg border border-health-critical/20">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-health-critical">Críticos</CardTitle>
                  <AlertCircle className="h-4 w-4 text-health-critical" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-health-critical">{stats.critical}</div>
                  <p className="text-xs text-health-critical/70">0-34 pontos</p>
                </CardContent>
              </Card>
            </div>

            {/* Team Overview or Individual Clients */}
        {selectedPlanner === "all" ? (
          <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Performance por Planejador
              </CardTitle>
              <CardDescription>
                Análise comparativa da carteira de cada planejador
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plannerStats.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum cliente cadastrado ainda. Clique em "Novo Cliente" para começar.
                </div>
              ) : (
                <div className="space-y-4">
                  {plannerStats.map(stat => (
                    <div key={stat.planner} className="flex items-center justify-between p-4 rounded-lg border bg-background/50">
                      <div className="flex items-center gap-4">
                        <div className="font-medium">{stat.planner}</div>
                        <Badge variant="outline" className="text-xs">
                          {stat.clientCount} {stat.clientCount === 1 ? 'cliente' : 'clientes'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-lg font-semibold">{stat.averageScore}</div>
                        <HealthScoreBadge
                          category={stat.category as any}
                          score={stat.averageScore}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-[var(--gradient-card)] border-0 shadow-[var(--shadow-card)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Clientes de {selectedPlanner}
              </CardTitle>
              <CardDescription>
                Análise detalhada da carteira individual
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredClients.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {selectedPlanner} ainda não possui clientes cadastrados.
                </div>
              ) : (
                <div className="space-y-3">
                  {healthScores.map((healthScore, index) => {
                    const client = filteredClients[index];
                    return (
                      <div key={client.id} className="flex items-center justify-between p-4 rounded-lg border bg-background/50 hover:bg-background/80 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="font-medium">{client.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {new Date(client.updatedAt).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-lg font-semibold">{healthScore.score}</div>
                          <HealthScoreBadge
                            category={healthScore.category}
                            score={healthScore.score}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsView clients={clients} selectedPlanner={selectedPlanner} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}