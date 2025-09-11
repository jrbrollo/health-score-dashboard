import { useState, useMemo, useEffect } from "react";
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
  BarChart3,
  Edit,
  AlertTriangle
} from "lucide-react";
import { Client, Planner, HealthScore } from "@/types/client";
import { calculateHealthScore, getHealthCategoryColor } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { AnalyticsView } from "./AnalyticsView";
import { BulkImport } from "./BulkImport";
import { ThemeToggle } from "./ui/theme-toggle";
import TemporalAnalysisComponent from "./TemporalAnalysis";

interface DashboardProps {
  clients: Client[];
  onAddClient: () => void;
  onBulkImport?: (clients: Omit<Client, "id" | "createdAt" | "updatedAt">[]) => void;
  onManageClients?: (planner?: Planner | "all") => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
}

const planners: Planner[] = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraao", "Murilo", "Felipe", "Helio", "Vinícius"];

export function Dashboard({ clients, onAddClient, onBulkImport, onManageClients, isDarkMode = false, onToggleDarkMode }: DashboardProps) {
  const [selectedPlanner, setSelectedPlanner] = useState<Planner | "all">("all");
  const [showBulkImport, setShowBulkImport] = useState(false);


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

  const handleBulkImport = (importedClients: Omit<Client, "id" | "createdAt" | "updatedAt">[]) => {
    if (onBulkImport) {
      onBulkImport(importedClients);
    }
    setShowBulkImport(false);
  };

  if (showBulkImport) {
    return (
      <BulkImport
        onImport={handleBulkImport}
        onClose={() => setShowBulkImport(false)}
        isDarkMode={isDarkMode}
      />
    );
  }

  return (
    <div className={`min-h-screen p-6 transition-colors duration-300 ${isDarkMode ? 'gradient-bg-dark text-white' : 'gradient-bg-light text-gray-900'}`}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Health Score Dashboard
              </h1>
              <p className="text-muted-foreground text-lg mt-2">
                Análise da carteira de clientes - Braúna
              </p>
            </div>
            <ThemeToggle 
              isDark={isDarkMode} 
              onToggle={onToggleDarkMode || (() => {})} 
            />
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
            
            <div className="flex gap-2">
              <Button 
                onClick={onAddClient} 
                className="btn-gradient"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Cliente
              </Button>
              
              {onBulkImport && (
                <Button 
                  onClick={() => setShowBulkImport(true)}
                  variant="outline"
                  className="shadow-lg"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Importar CSV
                </Button>
              )}

              {onManageClients && clients.length > 0 && (
                <Button 
                  onClick={() => onManageClients(selectedPlanner)}
                  variant="outline"
                  className="shadow-lg"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Gerenciar Clientes
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Visão Geral
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Análise Avançada
            </TabsTrigger>
            <TabsTrigger value="temporal" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Análise Temporal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
              <Card className={`animate-fade-in-up animate-delay-100 ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
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

              <Card className={`animate-fade-in-up animate-delay-200 ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
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

              <Card className={`animate-fade-in-up animate-delay-300 group relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-emerald-900/80 to-green-900/80 border-emerald-700/50' : 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200/50'}`}>
                <div className={`absolute inset-0 bg-gradient-to-r opacity-20 transition-opacity duration-300 group-hover:opacity-30 ${isDarkMode ? 'from-emerald-500 to-green-600' : 'from-emerald-400 to-green-500'}`}></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className={`text-sm font-bold ${isDarkMode ? 'text-emerald-200' : 'text-emerald-800'}`}>Ótimos</CardTitle>
                  <div className={`p-2 rounded-lg transition-all duration-300 group-hover:rotate-12 ${isDarkMode ? 'bg-emerald-500/25 group-hover:bg-emerald-500/35' : 'bg-emerald-100 group-hover:bg-emerald-200'}`}>
                    <Award className={`h-4 w-4 transition-colors duration-300 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`} />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className={`text-3xl font-black transition-colors duration-300 ${isDarkMode ? 'text-emerald-100' : 'text-emerald-800'}`}>{stats.excellent}</div>
                  <p className={`text-xs font-bold mt-1 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>100+ pontos</p>
                </CardContent>
              </Card>

              <Card className={`animate-fade-in-up animate-delay-400 group relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-blue-900/80 to-cyan-900/80 border-blue-700/50' : 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200/50'}`}>
                <div className={`absolute inset-0 bg-gradient-to-r opacity-20 transition-opacity duration-300 group-hover:opacity-30 ${isDarkMode ? 'from-blue-500 to-cyan-600' : 'from-blue-400 to-cyan-500'}`}></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className={`text-sm font-bold ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>Estáveis</CardTitle>
                  <div className={`p-2 rounded-lg transition-all duration-300 group-hover:scale-110 ${isDarkMode ? 'bg-blue-500/25 group-hover:bg-blue-500/35' : 'bg-blue-100 group-hover:bg-blue-200'}`}>
                    <TrendingUp className={`h-4 w-4 transition-colors duration-300 ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`} />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className={`text-3xl font-black transition-colors duration-300 ${isDarkMode ? 'text-blue-100' : 'text-blue-800'}`}>{stats.stable}</div>
                  <p className={`text-xs font-bold mt-1 ${isDarkMode ? 'text-blue-300' : 'text-blue-700'}`}>60-99 pontos</p>
                </CardContent>
              </Card>

              <Card className={`animate-fade-in-up animate-delay-500 group relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-amber-900/80 to-yellow-900/80 border-amber-700/50' : 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200/50'}`}>
                <div className={`absolute inset-0 bg-gradient-to-r opacity-20 transition-opacity duration-300 group-hover:opacity-30 ${isDarkMode ? 'from-amber-500 to-yellow-600' : 'from-amber-400 to-yellow-500'}`}></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className={`text-sm font-bold ${isDarkMode ? 'text-amber-200' : 'text-amber-800'}`}>Atenção</CardTitle>
                  <div className={`p-2 rounded-lg transition-all duration-300 group-hover:animate-pulse ${isDarkMode ? 'bg-amber-500/25 group-hover:bg-amber-500/35' : 'bg-amber-100 group-hover:bg-amber-200'}`}>
                    <AlertTriangle className={`h-4 w-4 transition-colors duration-300 ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`} />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className={`text-3xl font-black transition-colors duration-300 ${isDarkMode ? 'text-amber-100' : 'text-amber-800'}`}>{stats.warning}</div>
                  <p className={`text-xs font-bold mt-1 ${isDarkMode ? 'text-amber-300' : 'text-amber-700'}`}>35-59 pontos</p>
                </CardContent>
              </Card>

              <Card className={`animate-fade-in-up animate-delay-600 group relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-red-900/80 to-rose-900/80 border-red-700/50' : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200/50'}`}>
                <div className={`absolute inset-0 bg-gradient-to-r opacity-20 transition-opacity duration-300 group-hover:opacity-30 ${isDarkMode ? 'from-red-500 to-rose-600' : 'from-red-400 to-rose-500'}`}></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className={`text-sm font-bold ${isDarkMode ? 'text-red-200' : 'text-red-800'}`}>Críticos</CardTitle>
                  <div className={`p-2 rounded-lg transition-all duration-300 group-hover:animate-bounce ${isDarkMode ? 'bg-red-500/25 group-hover:bg-red-500/35' : 'bg-red-100 group-hover:bg-red-200'}`}>
                    <AlertCircle className={`h-4 w-4 transition-colors duration-300 ${isDarkMode ? 'text-red-300' : 'text-red-700'}`} />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className={`text-3xl font-black transition-colors duration-300 ${isDarkMode ? 'text-red-100' : 'text-red-800'}`}>{stats.critical}</div>
                  <p className={`text-xs font-bold mt-1 ${isDarkMode ? 'text-red-300' : 'text-red-700'}`}>0-34 pontos</p>
                </CardContent>
              </Card>
            </div>

            {/* Team Overview or Individual Clients */}
        {selectedPlanner === "all" ? (
          <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
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
          <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
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
            <AnalyticsView clients={clients} selectedPlanner={selectedPlanner} isDarkMode={isDarkMode} />
          </TabsContent>

          <TabsContent value="temporal">
            <TemporalAnalysisComponent isDarkMode={isDarkMode} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}