import { useState, useMemo, useEffect, useCallback, memo } from "react";
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
// Importar ícones de forma explícita para evitar problemas de tree-shaking após logout/login
// Importar cada ícone individualmente para garantir que sejam sempre incluídos no bundle
import { 
  Search, 
  Users, 
  X,
  Filter,
  Eye,
  TrendingUp,
  ChevronsUpDown,
  Check,
  Download,
  Save,
  Bookmark,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

// Garantir que os ícones sejam sempre referenciados (evitar tree-shaking)
// Esta referência garante que os ícones sejam incluídos mesmo após logout/login
// Usar uma função que retorna os ícones para garantir que não sejam removidos
const getIcons = () => ({
  Search, 
  Users, 
  X,
  Filter,
  Eye,
  TrendingUp,
  ChevronsUpDown,
  Check,
  Download,
  Save,
  Bookmark,
  ChevronLeft,
  ChevronRight
});

// Chamar a função para garantir que os ícones sejam incluídos no bundle
// Isso evita que o tree-shaking remova os ícones não usados diretamente
if (process.env.NODE_ENV === 'development') {
  console.log('Ícones carregados:', Object.keys(getIcons()));
}
import { Client, Planner } from "@/types/client";
import { calculateHealthScore } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { ThemeToggle } from "./ui/theme-toggle";
import { Logo } from "./Logo";
import { buildUniqueList, applyHierarchyFilters, HierarchyFilters } from "@/lib/filters";
import { getHierarchyNames } from "@/services/hierarchyService";
import { useAuth } from "@/contexts/AuthContext";
import { exportClients } from "@/utils/exportUtils";
import { saveFilters, getSavedFilters, deleteSavedFilter, applySavedFilters, SavedFilters } from "@/utils/filterStorage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { temporalService } from "@/services/temporalService";
import { HealthScoreHistory } from "@/types/temporal";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";
import { MIN_HISTORY_DATE } from "@/lib/constants";

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
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // Itens por página
  
  // Filtros salvos
  const [savedFiltersList, setSavedFiltersList] = useState<SavedFilters[]>([]);
  const [saveFilterDialogOpen, setSaveFilterDialogOpen] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [loadingExport, setLoadingExport] = useState(false);

  // Carregar histórico quando visualizar cliente
  useEffect(() => {
    if (viewingClient) {
      setLoadingHistory(true);
      setClientHistory([]); // Reset histórico ao mudar de cliente
      temporalService.getClientHistory(viewingClient.id)
        .then(history => {
          setClientHistory(history || []);
          setLoadingHistory(false);
        })
        .catch(err => {
          console.error('Erro ao carregar histórico:', err);
          setClientHistory([]); // Garantir array vazio em caso de erro
          setLoadingHistory(false);
        });
    } else {
      // Reset quando fechar o drawer
      setClientHistory([]);
      setLoadingHistory(false);
    }
  }, [viewingClient]);

  // Hierarquia persistente da tabela hierarchy_roles
  const [managers, setManagers] = useState<string[]>([]);
  const [mediators, setMediators] = useState<string[]>([]);
  const [leaders, setLeaders] = useState<string[]>([]);
  
  // Carregar hierarquia da tabela hierarchy_roles
  useEffect(() => {
    const loadHierarchy = async () => {
      try {
        const hierarchy = await getHierarchyNames();
        setManagers(hierarchy.managers);
        setMediators(hierarchy.mediators);
        setLeaders(hierarchy.leaders);
      } catch (error) {
        console.error('Erro ao carregar hierarquia:', error);
      }
    };
    loadHierarchy();
  }, []);
  
  // Carregar filtros salvos
  useEffect(() => {
    setSavedFiltersList(getSavedFilters());
  }, []);
  
  // Função para salvar filtros atuais
  const handleSaveFilters = () => {
    if (!filterName.trim()) return;
    
    saveFilters({
      planner: filterPlanner === 'all' ? undefined : filterPlanner,
      manager: filterManager === 'all' ? undefined : filterManager,
      mediator: filterMediator === 'all' ? undefined : filterMediator,
      leader: filterLeader === 'all' ? undefined : filterLeader,
      category: filterCategory === 'all' ? undefined : filterCategory,
      searchTerm: searchTerm || undefined,
    }, filterName.trim());
    
    setSavedFiltersList(getSavedFilters());
    setFilterName('');
    setSaveFilterDialogOpen(false);
  };
  
  // Função para aplicar filtros salvos
  const handleApplySavedFilters = (savedFilter: SavedFilters) => {
    if (savedFilter.planner) setFilterPlanner(savedFilter.planner as Planner);
    else setFilterPlanner('all');
    if (savedFilter.manager) setFilterManager(savedFilter.manager);
    else setFilterManager('all');
    if (savedFilter.mediator) setFilterMediator(savedFilter.mediator);
    else setFilterMediator('all');
    if (savedFilter.leader) setFilterLeader(savedFilter.leader);
    else setFilterLeader('all');
    if (savedFilter.category) setFilterCategory(savedFilter.category);
    else setFilterCategory('all');
    if (savedFilter.searchTerm) setSearchTerm(savedFilter.searchTerm);
    else setSearchTerm('');
  };
  
  // Função para exportar clientes
  const handleExportClients = async () => {
    setLoadingExport(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100)); // Pequeno delay para feedback visual
      exportClients(filteredClients, {
        format: 'csv',
        filters: {
          planner: filterPlanner === 'all' ? undefined : filterPlanner,
          manager: filterManager === 'all' ? undefined : filterManager,
          mediator: filterMediator === 'all' ? undefined : filterMediator,
          leader: filterLeader === 'all' ? undefined : filterLeader,
          category: filterCategory === 'all' ? undefined : filterCategory,
        }
      });
    } finally {
      setLoadingExport(false);
    }
  };

  // Unique planners (ainda vem dos clientes, mas filtra valores numéricos)
  // IMPORTANTE: No Dashboard, Gerentes/Mediadores/Líderes DEVEM aparecer na lista de Planejadores
  // para que possam filtrar seus próprios clientes quando atendem como planejadores
  const planners = useMemo(() => {
    const allPlanners = buildUniqueList(clients, 'planner') as Planner[];
    // Filtrar apenas valores numéricos - NÃO excluir Gerentes/Mediadores/Líderes
    return allPlanners.filter(p => {
      // Excluir apenas valores que são números
      return !/^[0-9]+$/.test(p.trim());
    });
  }, [clients]);
  
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

  // Paginação dos clientes filtrados
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClients = useMemo(() => {
    return filteredClients.slice(startIndex, endIndex);
  }, [filteredClients, startIndex, endIndex]);

  // Reset página quando filtros mudam
  useEffect(() => {
    setCurrentPage(1);
  }, [filterPlanner, filterManager, filterMediator, filterLeader, debouncedSearchTerm, filterCategory]);


  // Memoizar função de cores para evitar recriação a cada render
  const getHealthScoreColor = useCallback((category: string) => {
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
  }, [isDarkMode]);

  // Memoizar classes CSS baseadas no tema para evitar recálculo
  const themeClasses = useMemo(() => ({
    card: isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover',
    textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
    textMuted: isDarkMode ? 'text-gray-400' : 'text-gray-500',
    bg: isDarkMode ? 'bg-gray-900' : 'bg-white',
    border: isDarkMode ? '#374151' : '#e5e7eb',
    text: isDarkMode ? '#f9fafb' : '#111827',
    line: isDarkMode ? '#9ca3af' : '#6b7280',
    chartLine: isDarkMode ? '#3b82f6' : '#2563eb',
  }), [isDarkMode]);

  // Memoizar health scores calculados para evitar recálculo desnecessário
  const clientHealthScores = useMemo(() => {
    const scores = new Map<string, ReturnType<typeof calculateHealthScore>>();
    filteredClients.forEach(client => {
      scores.set(client.id, calculateHealthScore(client));
    });
    return scores;
  }, [filteredClients]);

  // Componente memoizado para card de cliente - evita re-renderização desnecessária
  type ThemeClasses = {
    card: string;
    textSecondary: string;
    textMuted: string;
    bg: string;
    border: string;
    text: string;
    line: string;
    chartLine: string;
  };

  const ClientCard = memo(({ 
    client, 
    healthScore, 
    onViewDetails,
    themeClasses,
    getHealthScoreColor
  }: { 
    client: Client; 
    healthScore: ReturnType<typeof calculateHealthScore>;
    onViewDetails: (client: Client) => void;
    themeClasses: ThemeClasses;
    getHealthScoreColor: (category: string) => string;
  }) => {
    return (
      <Card className={themeClasses.card}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h3 className="text-lg font-semibold">{client.name}</h3>
                <p className={`text-sm ${themeClasses.textSecondary}`}>
                  Planejador: {client.planner}
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
                onClick={() => onViewDetails(client)}
              >
                <Eye className="h-4 w-4 mr-2" />
                Ver Detalhes
              </Button>
            </div>
          </div>

          {/* Informações rápidas - Métricas v3 */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className={themeClasses.textMuted}>NPS Score:</span>
              <p className="font-medium">
                {client.npsScoreV3 !== null && client.npsScoreV3 !== undefined 
                  ? client.npsScoreV3 
                  : "Não avaliado"}
              </p>
            </div>
            <div>
              <span className={themeClasses.textMuted}>Tem Indicação:</span>
              <p className="font-medium">{client.hasNpsReferral ? "Sim" : "Não"}</p>
            </div>
            <div>
              <span className={themeClasses.textMuted}>Inadimplência:</span>
              <p className="font-medium">
                {client.overdueInstallments === 0 || !client.overdueInstallments
                  ? "Em dia"
                  : `${client.overdueInstallments} parcela${client.overdueInstallments > 1 ? 's' : ''} (${client.overdueDays || 0} dias)`}
              </p>
            </div>
            <div>
              <span className={themeClasses.textMuted}>Cross Sell:</span>
              <p className="font-medium">{client.crossSellCount || 0} produto{(client.crossSellCount || 0) !== 1 ? 's' : ''}</p>
            </div>
            <div>
              <span className={themeClasses.textMuted}>Meses Relacionamento:</span>
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
  });
  
  ClientCard.displayName = 'ClientCard';

  return (
    <div 
      className={`min-h-screen p-4 sm:p-6 transition-colors duration-150 ${isDarkMode ? 'gradient-bg-dark text-white' : 'gradient-bg-light text-gray-900'}`}
      style={{ willChange: 'background-color, color' }}
    >
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-6 md:gap-10">
            <Logo isDarkMode={isDarkMode} className="scale-110 sm:scale-100" />
            <div className="hidden md:block border-l pl-4 ml-2">
              <h2 className="text-lg font-semibold">Gerenciar Clientes</h2>
              <p className="text-muted-foreground text-sm">
                {filterPlanner === "all" 
                  ? `Visualizando clientes de todos os planejadores (${filteredClients.length} clientes${totalPages > 1 ? ` - Página ${currentPage}/${totalPages}` : ''})`
                  : `Visualizando clientes de ${filterPlanner} (${filteredClients.length} clientes${totalPages > 1 ? ` - Página ${currentPage}/${totalPages}` : ''})`
                }
              </p>
            </div>
            <ThemeToggle 
              isDark={isDarkMode} 
              onToggle={onToggleDarkMode || (() => {})} 
            />
          </div>
          <Button variant="outline" onClick={onBack} className="shadow-lg w-full sm:w-auto">
            Voltar ao Dashboard
          </Button>
        </div>

        {/* Filtros */}
        <Card className={themeClasses.card}>
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
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-64 p-0" align="start">
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
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-64 p-0" align="start">
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
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-64 p-0" align="start">
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
                  <PopoverContent className="w-[calc(100vw-2rem)] sm:w-64 p-0" align="start">
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
            
            {/* Botões de ação */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleExportClients}
                disabled={loadingExport || filteredClients.length === 0}
                aria-label="Exportar clientes para CSV"
              >
                <Download className="h-4 w-4 mr-2" />
                {loadingExport ? 'Exportando...' : 'Exportar CSV'}
              </Button>
              <Dialog open={saveFilterDialogOpen} onOpenChange={setSaveFilterDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    aria-label="Salvar filtros atuais"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Filtros
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Salvar Filtros</DialogTitle>
                    <DialogDescription>
                      Digite um nome para salvar os filtros atuais
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    placeholder="Ex: Meus Clientes Críticos"
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && filterName.trim()) {
                        handleSaveFilters();
                      }
                    }}
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSaveFilterDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveFilters} disabled={!filterName.trim()}>
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              {/* Lista de filtros salvos */}
              {savedFiltersList.length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" aria-label="Aplicar filtros salvos">
                      <Bookmark className="h-4 w-4 mr-2" />
                      Filtros Salvos ({savedFiltersList.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm mb-2">Filtros Salvos</h4>
                      {savedFiltersList.map((savedFilter, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-2 rounded border hover:bg-accent cursor-pointer"
                          onClick={() => handleApplySavedFilters(savedFilter)}
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{savedFilter.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {savedFilter.planner && `Planejador: ${savedFilter.planner} `}
                              {savedFilter.category && `Categoria: ${savedFilter.category}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSavedFilter(savedFilter.name);
                              setSavedFiltersList(getSavedFilters());
                            }}
                            aria-label={`Deletar filtro ${savedFilter.name}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Lista de Clientes */}
        <div className="space-y-4">
          {filteredClients.length === 0 ? (
            <Card className={themeClasses.card}>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum cliente encontrado</h3>
                <p className="text-muted-foreground text-center">
                  {searchTerm ? "Tente ajustar os filtros de busca." : "Não há clientes cadastrados ainda."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedClients.map((client) => {
                  const healthScore = clientHealthScores.get(client.id) || calculateHealthScore(client);
                
                return (
                    <ClientCard
                      key={client.id}
                      client={client}
                      healthScore={healthScore}
                      onViewDetails={setViewingClient}
                      themeClasses={themeClasses}
                      getHealthScoreColor={getHealthScoreColor}
                    />
                  );
                })}
              </div>
              
              {/* Controles de Paginação */}
              {totalPages > 1 && (
                <Card className={themeClasses.card}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {startIndex + 1} a {Math.min(endIndex, filteredClients.length)} de {filteredClients.length} clientes
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        aria-label="Página anterior"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Anterior
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                              aria-label={`Ir para página ${pageNum}`}
                              aria-current={currentPage === pageNum ? "page" : undefined}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        aria-label="Próxima página"
                      >
                        Próxima
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Drawer de Detalhes do Cliente */}
      <Drawer open={!!viewingClient} onOpenChange={(open) => !open && setViewingClient(null)}>
        <DrawerContent className={`max-h-[90vh] ${isDarkMode ? 'gradient-bg-dark' : 'bg-white'}`}>
          {viewingClient && (
            <>
              <DrawerHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div>
                    <DrawerTitle className={`text-2xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {viewingClient.name}
                    </DrawerTitle>
                    <DrawerDescription className={`mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                      Planejador: {viewingClient.planner} • 
                      {viewingClient.manager && ` Gerente: ${viewingClient.manager} •`}
                      {viewingClient.mediator && ` Mediador: ${viewingClient.mediator}`}
                      {viewingClient.leader && ` • Líder: ${viewingClient.leader}`}
                    </DrawerDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setViewingClient(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </DrawerHeader>
              
              <div className={`overflow-y-auto p-6 space-y-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
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
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100'}`}>
                                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>NPS</span>
                                <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{healthScore.breakdown.nps} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100'}`}>
                                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Indicação</span>
                                <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{healthScore.breakdown.referral} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100'}`}>
                                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Inadimplência</span>
                                <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{healthScore.breakdown.payment} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100'}`}>
                                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Cross Sell</span>
                                <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{healthScore.breakdown.crossSell} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg md:col-span-2 ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-100'}`}>
                                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Meses Relacionamento</span>
                                <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{healthScore.breakdown.tenure} pts</span>
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
                        <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Carregando histórico...</p>
                      </div>
                    ) : clientHistory.length === 0 ? (
                      <div className="flex items-center justify-center h-64">
                        <p className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Nenhum histórico disponível ainda</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={clientHistory
                          .filter(h => {
                            const recordDate = new Date(h.recordedDate);
                            recordDate.setHours(0, 0, 0, 0);
                            return recordDate >= MIN_HISTORY_DATE;
                          })
                          .map(h => ({
                          date: h.recordedDate.toLocaleDateString('pt-BR'),
                          score: h.healthScore,
                          category: h.healthCategory
                        }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke={themeClasses.border} />
                          <XAxis 
                            dataKey="date" 
                            stroke={themeClasses.line}
                            fontSize={12}
                          />
                          <YAxis 
                            stroke={themeClasses.line}
                            fontSize={12}
                            domain={[0, 100]}
                          />
                          <RechartsTooltip 
                            contentStyle={{
                              backgroundColor: themeClasses.bg,
                              border: `1px solid ${themeClasses.border}`,
                              borderRadius: '8px',
                              color: themeClasses.text
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="score" 
                            stroke={themeClasses.chartLine} 
                            strokeWidth={2}
                            dot={{ fill: themeClasses.chartLine, r: 4 }}
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
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>NPS Score v3:</span>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{viewingClient.npsScoreV3 ?? 'Não informado'}</p>
                      </div>
                      <div>
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Tem Indicação:</span>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{viewingClient.hasNpsReferral ? 'Sim' : 'Não'}</p>
                      </div>
                      <div>
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Parcelas em Atraso:</span>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{viewingClient.overdueInstallments ?? 0}</p>
                      </div>
                      <div>
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Dias em Atraso:</span>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{viewingClient.overdueDays ?? 0}</p>
                      </div>
                      <div>
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Produtos Cross Sell:</span>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{viewingClient.crossSellCount ?? 0}</p>
                      </div>
                      <div>
                        <span className={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>Meses desde Fechamento:</span>
                        <p className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{viewingClient.monthsSinceClosing ?? 'Não informado'}</p>
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
