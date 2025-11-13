import { useState, useMemo, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  Search, 
  Users, 
  X,
  Filter,
  Eye,
  TrendingUp,
  ChevronsUpDown,
  Check
} from "lucide-react";
import { Client, Planner } from "@/types/client";
import { calculateHealthScore } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { ThemeToggle } from "./ui/theme-toggle";
import { Logo } from "./Logo";
import { buildUniqueList, applyHierarchyFilters, HierarchyFilters } from "@/lib/filters";
import { useAuth } from "@/contexts/AuthContext";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { temporalService } from "@/services/temporalService";
import { HealthScoreHistory } from "@/types/temporal";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface ClientManagerProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  onBack: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  authFilters?: HierarchyFilters | null;
}

// planners dinâmicos a partir dos clientes

export function ClientManager({ clients, selectedPlanner, onBack, isDarkMode = false, onToggleDarkMode, authFilters }: ClientManagerProps) {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPlanner, setFilterPlanner] = useState<Planner | "all">(selectedPlanner);
  const [filterManager, setFilterManager] = useState<string | "all">("all");
  const [filterMediator, setFilterMediator] = useState<string | "all">("all");
  const [filterLeader, setFilterLeader] = useState<string | "all">("all");
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [clientHistory, setClientHistory] = useState<HealthScoreHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [plannerSearchOpen, setPlannerSearchOpen] = useState(false);
  const [managerSearchOpen, setManagerSearchOpen] = useState(false);
  const [mediatorSearchOpen, setMediatorSearchOpen] = useState(false);
  const [leaderSearchOpen, setLeaderSearchOpen] = useState(false);

  // Carregar histórico quando visualizar cliente
  useEffect(() => {
    if (viewingClient) {
      setLoadingHistory(true);
      temporalService.getClientHistory(viewingClient.id)
        .then(history => {
          setClientHistory(history);
          setLoadingHistory(false);
        })
        .catch(err => {
          console.error('Erro ao carregar histórico:', err);
          setLoadingHistory(false);
        });
    }
  }, [viewingClient]);

  const planners = useMemo(() => buildUniqueList(clients, 'planner') as Planner[], [clients]);
  const managers = useMemo(() => buildUniqueList(clients, 'manager'), [clients]);
  const mediators = useMemo(() => buildUniqueList(clients, 'mediator'), [clients]);
  const leaders = useMemo(() => buildUniqueList(clients, 'leader'), [clients]);
  
  // Labels para os filtros
  const plannerLabel = filterPlanner === "all" ? "Todos os Planejadores" : filterPlanner;
  const managerLabel = filterManager === "all" ? "Todos os Gerentes" : filterManager;
  const mediatorLabel = filterMediator === "all" ? "Todos os Mediadores" : filterMediator;
  const leaderLabel = filterLeader === "all" ? "Todos os Líderes" : filterLeader;

  // Filtrar clientes (combinando filtros de auth e filtros do usuário)
  const filteredClients = useMemo(() => {
    // Começar com filtros de autenticação
    let baseFilters: HierarchyFilters = authFilters || {
      selectedPlanner: null,
      managers: [],
      mediators: [],
      leaders: [],
    };

    // Aplicar filtros adicionais do usuário (se permitido pelo role)
    const userFilters: HierarchyFilters = {
      selectedPlanner: profile?.role === 'manager' ? (filterPlanner === 'all' ? null : filterPlanner) : baseFilters.selectedPlanner,
      managers: profile?.role === 'manager' && filterManager !== 'all' ? [filterManager] : baseFilters.managers,
      mediators: profile?.role === 'manager' && filterMediator !== 'all' ? [filterMediator] : baseFilters.mediators,
      leaders: profile?.role === 'manager' && filterLeader !== 'all' ? [filterLeader] : baseFilters.leaders,
    };

    // Se não for gerente, usar apenas filtros de auth
    const finalFilters = profile?.role === 'manager' ? userFilters : baseFilters;

    let filtered = applyHierarchyFilters(clients, finalFilters);

    if (debouncedSearchTerm) {
      filtered = filtered.filter(c => c.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
    }

    if (filterCategory !== "all") {
      filtered = filtered.filter(c => calculateHealthScore(c).category === filterCategory);
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, filterPlanner, filterManager, filterMediator, filterLeader, debouncedSearchTerm, filterCategory, authFilters, profile]);


  const getHealthScoreColor = (category: string) => {
    if (isDarkMode) {
      switch (category) {
        case "Ótimo": return "text-green-300 bg-green-900/30 border border-green-700";
        case "Estável": return "text-blue-300 bg-blue-900/30 border border-blue-700";
        case "Atenção": return "text-yellow-300 bg-yellow-900/30 border border-yellow-700";
        case "Crítico": return "text-red-300 bg-red-900/30 border border-red-700";
        default: return "text-gray-300 bg-gray-800/30 border border-gray-600";
      }
    } else {
      switch (category) {
        case "Ótimo": return "text-green-600 bg-green-100";
        case "Estável": return "text-blue-600 bg-blue-100";
        case "Atenção": return "text-yellow-600 bg-yellow-100";
        case "Crítico": return "text-red-600 bg-red-100";
        default: return "text-gray-600 bg-gray-100";
      }
    }
  };

  return (
    <div className={`min-h-screen p-6 transition-colors duration-300 ${isDarkMode ? 'gradient-bg-dark text-white' : 'gradient-bg-light text-gray-900'}`}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-10">
            <Logo isDarkMode={isDarkMode} />
            <div className="hidden md:block border-l pl-4 ml-2">
              <h2 className="text-lg font-semibold">Gerenciar Clientes</h2>
              <p className="text-muted-foreground text-sm">
                {filterPlanner === "all" 
                  ? `Visualizando clientes de todos os planejadores (${filteredClients.length} clientes)`
                  : `Visualizando clientes de ${filterPlanner} (${filteredClients.length} clientes)`
                }
              </p>
            </div>
            <ThemeToggle 
              isDark={isDarkMode} 
              onToggle={onToggleDarkMode || (() => {})} 
            />
          </div>
          <Button variant="outline" onClick={onBack} className="shadow-lg">
            Voltar ao Dashboard
          </Button>
        </div>

        {/* Filtros */}
        <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros e Busca
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <Label htmlFor="search">Buscar cliente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Digite o nome do cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              {/* Filtro: Planejador com busca */}
              <div>
                <Label>Filtrar por planejador</Label>
                <Popover open={plannerSearchOpen} onOpenChange={setPlannerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={plannerSearchOpen}
                      className={cn("w-full justify-between")}
                    >
                      <span className="truncate">{plannerLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar planejador..." />
                      <CommandList>
                        <CommandEmpty>Nenhum planejador encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setFilterPlanner("all");
                              setPlannerSearchOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filterPlanner === "all" ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">Todos os Planejadores</span>
                          </CommandItem>
                          {planners.map((planner) => (
                            <CommandItem
                              key={planner}
                              value={planner}
                              onSelect={() => {
                                setFilterPlanner(planner);
                                setPlannerSearchOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", filterPlanner === planner ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{planner}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Filtro: Gerente com busca */}
              <div>
                <Label>Gerente</Label>
                <Popover open={managerSearchOpen} onOpenChange={setManagerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={managerSearchOpen}
                      className={cn("w-full justify-between")}
                    >
                      <span className="truncate">{managerLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar gerente..." />
                      <CommandList>
                        <CommandEmpty>Nenhum gerente encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setFilterManager("all");
                              setManagerSearchOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filterManager === "all" ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">Todos os Gerentes</span>
                          </CommandItem>
                          {managers.map(manager => (
                            <CommandItem
                              key={manager}
                              value={manager}
                              onSelect={() => {
                                setFilterManager(manager);
                                setManagerSearchOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", filterManager === manager ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{manager}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Filtro: Mediador com busca */}
              <div>
                <Label>Mediador</Label>
                <Popover open={mediatorSearchOpen} onOpenChange={setMediatorSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={mediatorSearchOpen}
                      className={cn("w-full justify-between")}
                    >
                      <span className="truncate">{mediatorLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar mediador..." />
                      <CommandList>
                        <CommandEmpty>Nenhum mediador encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setFilterMediator("all");
                              setMediatorSearchOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filterMediator === "all" ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">Todos os Mediadores</span>
                          </CommandItem>
                          {mediators.map(mediator => (
                            <CommandItem
                              key={mediator}
                              value={mediator}
                              onSelect={() => {
                                setFilterMediator(mediator);
                                setMediatorSearchOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", filterMediator === mediator ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{mediator}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Filtro: Líder com busca */}
              <div>
                <Label>Líder em formação</Label>
                <Popover open={leaderSearchOpen} onOpenChange={setLeaderSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={leaderSearchOpen}
                      className={cn("w-full justify-between")}
                    >
                      <span className="truncate">{leaderLabel}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar líder..." />
                      <CommandList>
                        <CommandEmpty>Nenhum líder encontrado.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all"
                            onSelect={() => {
                              setFilterLeader("all");
                              setLeaderSearchOpen(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filterLeader === "all" ? "opacity-100" : "opacity-0")} />
                            <span className="truncate">Todos os Líderes</span>
                          </CommandItem>
                          {leaders.map(leader => (
                            <CommandItem
                              key={leader}
                              value={leader}
                              onSelect={() => {
                                setFilterLeader(leader);
                                setLeaderSearchOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", filterLeader === leader ? "opacity-100" : "opacity-0")} />
                              <span className="truncate">{leader}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div>
                <Label htmlFor="category">Filtrar por categoria</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    <SelectItem value="Ótimo">Ótimo</SelectItem>
                    <SelectItem value="Estável">Estável</SelectItem>
                    <SelectItem value="Atenção">Atenção</SelectItem>
                    <SelectItem value="Crítico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Clientes */}
        <div className="space-y-4">
          {filteredClients.length === 0 ? (
            <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum cliente encontrado</h3>
                <p className="text-muted-foreground text-center">
                  {searchTerm ? "Tente ajustar os filtros de busca." : "Não há clientes cadastrados ainda."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredClients.map((client) => {
              const healthScore = calculateHealthScore(client);
              
              return (
                <Card key={client.id} className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h3 className="text-lg font-semibold">{client.name}</h3>
                          <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            Planejador: {client.planner} • 
                            Última atualização: {new Date(client.updatedAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <HealthScoreBadge score={healthScore.score} category={healthScore.category} />
                          <Badge className={getHealthScoreColor(healthScore.category)}>
                            {healthScore.category}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewingClient(client)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Detalhes
                        </Button>
                      </div>
                    </div>

                    {/* Informações rápidas - Métricas v3 */}
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>NPS Score:</span>
                        <p className="font-medium">
                          {client.npsScoreV3 !== null && client.npsScoreV3 !== undefined 
                            ? client.npsScoreV3 
                            : "Não avaliado"}
                        </p>
                      </div>
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Tem Indicação:</span>
                        <p className="font-medium">{client.hasNpsReferral ? "Sim" : "Não"}</p>
                      </div>
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Inadimplência:</span>
                        <p className="font-medium">
                          {client.overdueInstallments === 0 || !client.overdueInstallments
                            ? "Em dia"
                            : `${client.overdueInstallments} parcela${client.overdueInstallments > 1 ? 's' : ''} (${client.overdueDays || 0} dias)`}
                        </p>
                      </div>
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Cross Sell:</span>
                        <p className="font-medium">{client.crossSellCount || 0} produto{(client.crossSellCount || 0) !== 1 ? 's' : ''}</p>
                      </div>
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Meses Relacionamento:</span>
                        <p className="font-medium">
                          {client.monthsSinceClosing !== null && client.monthsSinceClosing !== undefined
                            ? `${client.monthsSinceClosing} mês${client.monthsSinceClosing !== 1 ? 'es' : ''}`
                            : "Não informado"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Drawer de Detalhes do Cliente */}
      <Drawer open={!!viewingClient} onOpenChange={(open) => !open && setViewingClient(null)}>
        <DrawerContent className={`max-h-[90vh] ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          {viewingClient && (
            <>
              <DrawerHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <DrawerTitle className="text-2xl">{viewingClient.name}</DrawerTitle>
                    <DrawerDescription className="mt-2">
                      Planejador: {viewingClient.planner} • 
                      {viewingClient.manager && ` Gerente: ${viewingClient.manager} •`}
                      {viewingClient.mediator && ` Mediador: ${viewingClient.mediator}`}
                    </DrawerDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setViewingClient(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </DrawerHeader>
              
              <div className="overflow-y-auto p-6 space-y-6">
                {/* Score Atual */}
                <Card className={isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Health Score Atual
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(() => {
                      const healthScore = calculateHealthScore(viewingClient);
                      return (
                        <div className="space-y-4">
                          <div className="flex items-center gap-4">
                            <HealthScoreBadge score={healthScore.score} category={healthScore.category} />
                            <Badge className={getHealthScoreColor(healthScore.category)}>
                              {healthScore.category}
                            </Badge>
                          </div>
                          
                          {/* Breakdown Visual */}
                          <div className="space-y-3 mt-4">
                            <h4 className="font-semibold text-sm">Breakdown Detalhado:</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                                <span className="text-sm">NPS</span>
                                <span className="font-semibold">{healthScore.breakdown.nps} pts</span>
                              </div>
                              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                                <span className="text-sm">Indicação</span>
                                <span className="font-semibold">{healthScore.breakdown.referral} pts</span>
                              </div>
                              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                                <span className="text-sm">Inadimplência</span>
                                <span className="font-semibold">{healthScore.breakdown.payment} pts</span>
                              </div>
                              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800">
                                <span className="text-sm">Cross Sell</span>
                                <span className="font-semibold">{healthScore.breakdown.crossSell} pts</span>
                              </div>
                              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-100 dark:bg-gray-800 md:col-span-2">
                                <span className="text-sm">Meses Relacionamento</span>
                                <span className="font-semibold">{healthScore.breakdown.tenure} pts</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Gráfico de Evolução Temporal */}
                <Card className={isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'}>
                  <CardHeader>
                    <CardTitle>Evolução do Health Score</CardTitle>
                    <CardDescription>
                      Histórico de pontuação ao longo do tempo
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingHistory ? (
                      <div className="flex items-center justify-center h-64">
                        <p className="text-muted-foreground">Carregando histórico...</p>
                      </div>
                    ) : clientHistory.length === 0 ? (
                      <div className="flex items-center justify-center h-64">
                        <p className="text-muted-foreground">Nenhum histórico disponível ainda</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={clientHistory.map(h => ({
                          date: h.recordedDate.toLocaleDateString('pt-BR'),
                          score: h.healthScore,
                          category: h.healthCategory
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip />
                          <Legend />
                          <Line 
                            type="monotone" 
                            dataKey="score" 
                            stroke="#8884d8" 
                            strokeWidth={2}
                            name="Health Score"
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Informações Detalhadas */}
                <Card className={isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'}>
                  <CardHeader>
                    <CardTitle>Informações Detalhadas</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">NPS Score v3:</span>
                        <p className="font-medium">{viewingClient.npsScoreV3 ?? 'Não informado'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tem Indicação:</span>
                        <p className="font-medium">{viewingClient.hasNpsReferral ? 'Sim' : 'Não'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Parcelas em Atraso:</span>
                        <p className="font-medium">{viewingClient.overdueInstallments ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Dias em Atraso:</span>
                        <p className="font-medium">{viewingClient.overdueDays ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Produtos Cross Sell:</span>
                        <p className="font-medium">{viewingClient.crossSellCount ?? 0}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Meses desde Fechamento:</span>
                        <p className="font-medium">{viewingClient.monthsSinceClosing ?? 'Não informado'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

    </div>
  );
}
