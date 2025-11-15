import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  TrendingUp, 
  AlertCircle, 
  Award, 
  Filter, 
  BarChart3,
  AlertTriangle,
  ChevronsUpDown,
  Check
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Client, Planner, HealthScore, BulkImportPayload } from "@/types/client";
import { calculateHealthScore, getHealthCategoryColor } from "@/utils/healthScore";
import { buildUniqueList, applyHierarchyFilters, uniqueById, HierarchyFilters } from "@/lib/filters";
import { getHierarchyNames } from "@/services/hierarchyService";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { AnalyticsView } from "./AnalyticsView";
import { BulkImportV3 } from "./BulkImportV3";
import { ThemeToggle } from "./ui/theme-toggle";
import TemporalAnalysisComponent from "./TemporalAnalysis";
import AdvancedAnalytics from "./AdvancedAnalytics";
import DataQuality from "./DataQuality";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, User as UserIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { AnalysisInfoTooltip } from "./AnalysisInfoTooltip";
import { Logo } from "./Logo";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "./ui/drawer";
import { Eye, X, Download } from "lucide-react";
import { exportClients } from "@/utils/exportUtils";
import { temporalService } from "@/services/temporalService";
import { HealthScoreHistory } from "@/types/temporal";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts";
import { MIN_HISTORY_DATE } from "@/lib/constants";

interface DashboardProps {
  clients: Client[];
  onBulkImport?: (payload: BulkImportPayload) => void;
  onDeleteClient?: (clientId: string, clientName: string) => void;
  onManageClients?: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  authFilters?: HierarchyFilters | null;
  importProgress?: { current: number; total: number } | null;
}

// Lista de planejadores dinâmica, derivada dos clientes (sem nomes fixos)

export function Dashboard({ clients, onBulkImport, onDeleteClient, onManageClients, isDarkMode = false, onToggleDarkMode, authFilters, importProgress }: DashboardProps) {
  const { profile, signOut } = useAuth();
  const [selectedPlanner, setSelectedPlanner] = useState<string | null>(null);
  const [selectedManager, setSelectedManager] = useState<string | "all">("all");
  const [selectedMediator, setSelectedMediator] = useState<string | "all">("all");
  const [selectedLeader, setSelectedLeader] = useState<string | "all">("all");
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [plannerSearchOpen, setPlannerSearchOpen] = useState(false);
  const [managerSearchOpen, setManagerSearchOpen] = useState(false);
  const [mediatorSearchOpen, setMediatorSearchOpen] = useState(false);
  const [leaderSearchOpen, setLeaderSearchOpen] = useState(false);
  const [openCategoryDrawer, setOpenCategoryDrawer] = useState<string | null>(null);
  const [categoryDrawerClients, setCategoryDrawerClients] = useState<Client[]>([]);
  const [categoryDrawerTitle, setCategoryDrawerTitle] = useState<string>('');
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [clientHistory, setClientHistory] = useState<HealthScoreHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

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

  // Unique planners (ainda vem dos clientes, mas filtra valores numéricos)
  // IMPORTANTE: No Dashboard, Gerentes/Mediadores/Líderes DEVEM aparecer na lista de Planejadores
  // para que possam filtrar seus próprios clientes quando atendem como planejadores
  const planners = useMemo(() => {
    const allPlanners = buildUniqueList(clients, 'planner');
    // Filtrar apenas valores numéricos - NÃO excluir Gerentes/Mediadores/Líderes
    return allPlanners.filter(p => {
      // Excluir apenas valores que são números
      return !/^[0-9]+$/.test(p.trim());
    });
  }, [clients]);

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
    excellentCard: isDarkMode ? 'bg-gradient-to-br from-emerald-900/80 to-green-900/80 border-emerald-700/50' : 'bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-200/50',
    excellentGradient: isDarkMode ? 'from-emerald-500 to-green-600' : 'from-emerald-400 to-green-500',
    excellentText: isDarkMode ? 'text-emerald-200' : 'text-emerald-800',
    excellentBg: isDarkMode ? 'bg-emerald-500/25 group-hover:bg-emerald-500/35' : 'bg-emerald-100 group-hover:bg-emerald-200',
    excellentIcon: isDarkMode ? 'text-emerald-300' : 'text-emerald-700',
  }), [isDarkMode]);
  const plannerLabel = selectedPlanner ? `👤 ${selectedPlanner}` : "Todos os Planejadores";
  const managerLabel = selectedManager !== "all" ? selectedManager : "Todos os Gerentes";
  const mediatorLabel = selectedMediator !== "all" ? selectedMediator : "Todos os Mediadores";
  const leaderLabel = selectedLeader !== "all" ? selectedLeader : "Todos os Líderes";

  // Filter clients by planner + hierarchy (combinando filtros de auth e filtros do usuário)
  const filteredClients = useMemo(() => {
    // Começar com filtros de autenticação
    let baseFilters: HierarchyFilters = authFilters || {
      selectedPlanner: null,
      managers: [],
      mediators: [],
      leaders: [],
    };

    // Aplicar filtros adicionais do usuário
    // Gerente pode filtrar livremente
    // Líder e Mediador podem filtrar pelos planejadores abaixo deles
    // Planejador só vê seus próprios clientes (não pode filtrar outros)
    
    let finalFilters: HierarchyFilters;
    
    if (profile?.role === 'manager') {
      // Gerente: filtros livres
      finalFilters = {
        selectedPlanner: selectedPlanner,
        managers: selectedManager !== 'all' ? [selectedManager] : [],
        mediators: selectedMediator !== 'all' ? [selectedMediator] : [],
        leaders: selectedLeader !== 'all' ? [selectedLeader] : [],
      };
    } else if (profile?.role === 'planner') {
      // Planejador: apenas seus próprios clientes (não pode filtrar outros)
      finalFilters = baseFilters;
    } else {
      // Líder ou Mediador: pode filtrar pelos planejadores abaixo dele
      // Mas precisa respeitar os filtros de auth (hierarquia)
      // Se selecionou um planejador, usar ele; senão, usar o filtro de auth
      const plannerToUse = selectedPlanner || baseFilters.selectedPlanner;
      
      finalFilters = {
        selectedPlanner: plannerToUse,
        managers: baseFilters.managers,
        mediators: selectedMediator !== 'all' ? [selectedMediator] : baseFilters.mediators,
        leaders: selectedLeader !== 'all' ? [selectedLeader] : baseFilters.leaders,
      };
    }

    const filtered = applyHierarchyFilters(clients, finalFilters);
    return uniqueById(filtered);
  }, [clients, selectedPlanner, selectedManager, selectedMediator, selectedLeader, authFilters, profile]);

  // Calculate health scores for filtered clients
  const healthScores = useMemo(() => {
    return filteredClients.map(client => calculateHealthScore(client));
  }, [filteredClients]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = filteredClients.filter(c => c.isActive !== false).length;
    const excellent = healthScores.filter(score => score.category === "Ótimo").length;
    const stable = healthScores.filter(score => score.category === "Estável").length;
    const warning = healthScores.filter(score => score.category === "Atenção").length;
    const critical = healthScores.filter(score => score.category === "Crítico").length;
    
    const averageScore = healthScores.length > 0 
      ? Math.round(healthScores.reduce((sum, score) => sum + score.score, 0) / healthScores.length)
      : 0;

    return { total, excellent, stable, warning, critical, averageScore };
  }, [filteredClients, healthScores]);

  // Função para abrir drawer de categoria
  const handleCategoryCardClick = (category: 'Ótimo' | 'Estável' | 'Atenção' | 'Crítico') => {
    const categoryClients = filteredClients.filter(client => {
      const score = calculateHealthScore(client);
      return score.category === category;
    });

    const titles = {
      'Ótimo': 'Clientes Ótimos',
      'Estável': 'Clientes Estáveis',
      'Atenção': 'Clientes em Atenção',
      'Crítico': 'Clientes Críticos'
    };

    setCategoryDrawerClients(categoryClients);
    setCategoryDrawerTitle(titles[category]);
    setOpenCategoryDrawer(category);
  };

  const getCategoryHeaderStyles = (category: string) => {
    if (isDarkMode) {
      switch (category) {
        case 'Ótimo':
          return 'border-emerald-800/50';
        case 'Estável':
          return 'border-blue-800/50';
        case 'Atenção':
          return 'border-amber-800/50';
        case 'Crítico':
          return 'border-red-800/50';
        default:
          return 'border-border';
      }
    } else {
      switch (category) {
        case 'Ótimo':
          return 'border-emerald-200/50';
        case 'Estável':
          return 'border-blue-200/50';
        case 'Atenção':
          return 'border-amber-200/50';
        case 'Crítico':
          return 'border-red-200/50';
        default:
          return 'border-border';
      }
    }
  };

  // Função para obter estilos de card baseados na categoria (cores sutis)
  const getCategoryCardStyles = (category: string) => {
    if (isDarkMode) {
      switch (category) {
        case 'Ótimo':
          return 'border-l-4 border-emerald-500/50';
        case 'Estável':
          return 'border-l-4 border-blue-500/50';
        case 'Atenção':
          return 'border-l-4 border-amber-500/50';
        case 'Crítico':
          return 'border-l-4 border-red-500/50';
        default:
          return '';
      }
    } else {
      switch (category) {
        case 'Ótimo':
          return 'border-l-4 border-emerald-500';
        case 'Estável':
          return 'border-l-4 border-blue-500';
        case 'Atenção':
          return 'border-l-4 border-amber-500';
        case 'Crítico':
          return 'border-l-4 border-red-500';
        default:
          return '';
      }
    }
  };

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

  // Carregar histórico quando visualizar cliente
  useEffect(() => {
    if (viewingClient) {
      setLoadingHistory(true);
      setClientHistory([]); // Reset histórico ao mudar de cliente
      temporalService.getClientHistory(viewingClient.id)
        .then(history => {
          // Filtrar novamente no frontend para garantir (já filtrado no backend, mas garantia extra)
          const filteredHistory = (history || []).filter(h => {
            const recordDate = new Date(h.recordedDate);
            recordDate.setHours(0, 0, 0, 0);
            return recordDate >= MIN_HISTORY_DATE;
          });
          
          console.log(`[Dashboard] Histórico para ${viewingClient.name}:`, {
            total: history?.length || 0,
            filtrado: filteredHistory.length,
            minDate: MIN_HISTORY_DATE.toLocaleDateString('pt-BR')
          });
          
          setClientHistory(filteredHistory);
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

  // Group clients by planner for team view
  const plannerStats = useMemo(() => {
    if (selectedPlanner) return [];
    
    // Usar filteredClients em vez de clients para respeitar filtros de hierarquia
    // Extrair lista única de planejadores dos clientes filtrados
    const uniquePlanners = Array.from(new Set(
      filteredClients
        .filter(c => c.planner && c.planner !== '0' && c.isActive !== false)
        .map(c => c.planner)
    ));
    
    return uniquePlanners.map(planner => {
      const plannerClients = filteredClients.filter(client => {
        if (!client.planner || client.planner === '0') return false;
        if (client.isActive === false) return false;
        return client.planner === planner;
      });
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
  }, [filteredClients, selectedPlanner]);

  const handleBulkImport = (payload: BulkImportPayload) => {
    if (onBulkImport) {
      onBulkImport(payload);
    }
    setShowBulkImport(false);
  };

  if (showBulkImport) {
    return (
      <BulkImportV3
        onImport={handleBulkImport}
        onClose={() => setShowBulkImport(false)}
        isDarkMode={isDarkMode}
        importProgress={importProgress}
      />
    );
  }

  return (
    <div className={`min-h-screen p-4 sm:p-6 transition-colors duration-150 ${isDarkMode ? 'gradient-bg-dark text-white' : 'gradient-bg-light text-gray-900'}`}>
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 sm:gap-6 md:gap-10">
            <Logo isDarkMode={isDarkMode} className="scale-110 sm:scale-125" />
            <ThemeToggle 
              isDark={isDarkMode} 
              onToggle={onToggleDarkMode || (() => {})} 
            />
          </div>
          
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-4 w-full">
            {/* Menu do Usuário */}
            {profile && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback>
                        <UserIcon className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline">{profile.hierarchyName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{profile.hierarchyName}</p>
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {profile.role === 'manager' ? 'Gerente' :
                         profile.role === 'mediator' ? 'Mediador' :
                         profile.role === 'leader' ? 'Líder em Formação' :
                         'Planejador'}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => {
                      signOut().catch(err => {
                        console.error('Erro ao fazer logout:', err);
                      });
                    }} 
                    className="text-red-600 cursor-pointer"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            
            {/* Seletor de Planejador com busca */}
            <Popover open={plannerSearchOpen} onOpenChange={setPlannerSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={plannerSearchOpen}
                  className={cn("w-full sm:w-56 sm:min-w-[140px] justify-between")}
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
                          setSelectedPlanner(null);
                          setPlannerSearchOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", !selectedPlanner ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">Todos os Planejadores</span>
                      </CommandItem>
                      {planners.map((planner) => (
                        <CommandItem
                          key={planner}
                          value={planner}
                          onSelect={() => {
                            setSelectedPlanner(planner);
                            setPlannerSearchOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedPlanner === planner ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{planner}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Filtro: Gerente */}
            <Popover open={managerSearchOpen} onOpenChange={setManagerSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={managerSearchOpen}
                  className={cn("w-full sm:w-56 sm:min-w-[140px] justify-between")}
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
                          setSelectedManager("all");
                          setManagerSearchOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedManager === "all" ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">Todos os Gerentes</span>
                      </CommandItem>
                      {managers.map(manager => (
                        <CommandItem
                          key={manager}
                          value={manager}
                          onSelect={() => {
                            setSelectedManager(manager);
                            setManagerSearchOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedManager === manager ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{manager}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Filtro: Mediador */}
            <Popover open={mediatorSearchOpen} onOpenChange={setMediatorSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={mediatorSearchOpen}
                  className={cn("w-full sm:w-56 sm:min-w-[140px] justify-between")}
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
                          setSelectedMediator("all");
                          setMediatorSearchOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedMediator === "all" ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">Todos os Mediadores</span>
                      </CommandItem>
                      {mediators.map(mediator => (
                        <CommandItem
                          key={mediator}
                          value={mediator}
                          onSelect={() => {
                            setSelectedMediator(mediator);
                            setMediatorSearchOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedMediator === mediator ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{mediator}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Filtro: Líder em formação */}
            <Popover open={leaderSearchOpen} onOpenChange={setLeaderSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={leaderSearchOpen}
                  className={cn("w-full sm:w-56 sm:min-w-[140px] justify-between")}
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
                          setSelectedLeader("all");
                          setLeaderSearchOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", selectedLeader === "all" ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">Todos os Líderes</span>
                      </CommandItem>
                      {leaders.map(leader => (
                        <CommandItem
                          key={leader}
                          value={leader}
                          onSelect={() => {
                            setSelectedLeader(leader);
                            setLeaderSearchOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", selectedLeader === leader ? "opacity-100" : "opacity-0")} />
                          <span className="truncate">{leader}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            <div className="flex gap-2 shrink-0">
              {onManageClients && (
                <Button 
                  onClick={onManageClients}
                  variant="default"
                  className="shadow-lg whitespace-nowrap"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Gerenciar Clientes
                </Button>
              )}
              {onBulkImport && (
                <Button 
                  onClick={() => setShowBulkImport(true)}
                  variant="outline"
                  className="shadow-lg whitespace-nowrap"
                  aria-label="Importar CSV"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Importar CSV
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  exportClients(filteredClients, {
                    format: 'csv',
                    filters: {
                      planner: selectedPlanner || undefined,
                      manager: selectedManager !== 'all' ? selectedManager : undefined,
                      mediator: selectedMediator !== 'all' ? selectedMediator : undefined,
                      leader: selectedLeader !== 'all' ? selectedLeader : undefined,
                    }
                  });
                }}
                className="shadow-lg whitespace-nowrap"
                aria-label="Exportar dados"
                title="Exportar lista de clientes para CSV"
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <TabsList className="grid w-full grid-cols-5 min-w-[500px] sm:min-w-0">
              <TabsTrigger value="overview" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Users className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Visão Geral</span>
                <span className="sm:hidden">Geral</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Análise de Indicadores</span>
                <span className="sm:hidden">Indicadores</span>
              </TabsTrigger>
              <TabsTrigger value="temporal" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Análise Temporal</span>
                <span className="sm:hidden">Temporal</span>
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <Filter className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Análises Avançadas</span>
                <span className="sm:hidden">Avançadas</span>
              </TabsTrigger>
              <TabsTrigger value="quality" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                <AlertTriangle className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Qualidade de Dados</span>
                <span className="sm:hidden">Qualidade</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-2xl font-bold">Visão Geral</h2>
              <AnalysisInfoTooltip
                title="Visão Geral"
                description="Esta seção apresenta um resumo executivo da saúde geral da carteira de clientes, incluindo métricas principais e distribuição por categorias."
                tips={[
                  "Monitore o Score Médio para acompanhar a saúde geral da carteira",
                  "A distribuição por categorias ajuda a identificar quantos clientes precisam de atenção",
                  "Use os filtros para analisar performance por planejador, gerente, mediador ou líder",
                  "Compare o desempenho entre diferentes profissionais da equipe"
                ]}
              />
            </div>
            {/* Statistics Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6">
              <Card className={`animate-fade-in-up animate-delay-100 ${themeClasses.card}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total de Clientes</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-xs text-muted-foreground">
                    {selectedPlanner ? `de ${selectedPlanner}` : "em toda equipe"}
                  </p>
                </CardContent>
              </Card>

              <Card className={`animate-fade-in-up animate-delay-200 ${themeClasses.card}`}>
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

              <Card 
                onClick={() => handleCategoryCardClick('Ótimo')}
                className={`animate-fade-in-up animate-delay-300 group relative overflow-hidden transition-all duration-150 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer ${themeClasses.excellentCard}`}
              >
                <div className={`absolute inset-0 bg-gradient-to-r opacity-20 transition-opacity duration-150 group-hover:opacity-30 ${themeClasses.excellentGradient}`}></div>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
                  <CardTitle className={`text-sm font-bold ${themeClasses.excellentText}`}>Ótimos</CardTitle>
                  <div className={`p-2 rounded-lg transition-all duration-150 group-hover:rotate-12 ${themeClasses.excellentBg}`}>
                    <Award className={`h-4 w-4 transition-colors duration-150 ${themeClasses.excellentIcon}`} />
                  </div>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className={`text-3xl font-black transition-colors duration-300 ${isDarkMode ? 'text-emerald-100' : 'text-emerald-800'}`}>{stats.excellent}</div>
                  <p className={`text-xs font-bold mt-1 ${isDarkMode ? 'text-emerald-300' : 'text-emerald-700'}`}>100+ pontos</p>
                </CardContent>
              </Card>

              <Card 
                onClick={() => handleCategoryCardClick('Estável')}
                className={`animate-fade-in-up animate-delay-400 group relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer ${isDarkMode ? 'bg-gradient-to-br from-blue-900/80 to-cyan-900/80 border-blue-700/50' : 'bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200/50'}`}
              >
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

              <Card 
                onClick={() => handleCategoryCardClick('Atenção')}
                className={`animate-fade-in-up animate-delay-500 group relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer ${isDarkMode ? 'bg-gradient-to-br from-amber-900/80 to-yellow-900/80 border-amber-700/50' : 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200/50'}`}
              >
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

              <Card 
                onClick={() => handleCategoryCardClick('Crítico')}
                className={`animate-fade-in-up animate-delay-600 group relative overflow-hidden transition-all duration-300 hover:scale-105 shadow-lg hover:shadow-xl cursor-pointer ${isDarkMode ? 'bg-gradient-to-br from-red-900/80 to-rose-900/80 border-red-700/50' : 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200/50'}`}
              >
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
        {!selectedPlanner ? (
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
                            {client.lastSeenAt 
                              ? new Date(client.lastSeenAt).toLocaleDateString('pt-BR')
                              : new Date(client.updatedAt).toLocaleDateString('pt-BR')
                            }
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
            <AnalyticsView clients={filteredClients} selectedPlanner={selectedPlanner} isDarkMode={isDarkMode} />
          </TabsContent>

          <TabsContent value="temporal">
            <TemporalAnalysisComponent 
              isDarkMode={isDarkMode}
              selectedPlanner={selectedPlanner}
              selectedManager={selectedManager}
              selectedMediator={selectedMediator}
              selectedLeader={selectedLeader}
              currentClientCount={filteredClients.length}
              filteredClients={filteredClients}
            />
          </TabsContent>

          <TabsContent value="advanced">
            <AdvancedAnalytics 
              clients={filteredClients} 
              selectedPlanner={selectedPlanner ?? 'all'} 
              isDarkMode={isDarkMode}
              manager={selectedManager}
              mediator={selectedMediator}
              leader={selectedLeader}
            />
          </TabsContent>

          <TabsContent value="quality">
            <DataQuality isDarkMode={isDarkMode} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Drawer de Categoria de Clientes */}
      <Drawer open={!!openCategoryDrawer} onOpenChange={(open) => !open && setOpenCategoryDrawer(null)}>
        <DrawerContent className={`max-h-[90vh] ${isDarkMode ? 'gradient-bg-dark' : 'bg-white'}`}>
          <div className="max-w-4xl mx-auto w-full p-6 overflow-y-auto">
            <DrawerHeader className={`border-b pb-4 ${openCategoryDrawer ? getCategoryHeaderStyles(openCategoryDrawer) : ''}`}>
              <div className="flex items-center justify-between">
                <div>
                  <DrawerTitle className={`text-2xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {categoryDrawerTitle}
                  </DrawerTitle>
                  <DrawerDescription className={`mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {categoryDrawerClients.length} {categoryDrawerClients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}
                  </DrawerDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setOpenCategoryDrawer(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DrawerHeader>

            <div className="mt-6 space-y-3">
              {categoryDrawerClients.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p>Nenhum cliente encontrado nesta categoria.</p>
                </div>
              ) : (
                categoryDrawerClients.map((client) => {
                  const healthScore = calculateHealthScore(client);
                  return (
                    <Card 
                      key={client.id} 
                      className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'} ${getCategoryCardStyles(healthScore.category)}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div>
                              <h3 className={`font-semibold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                                {client.name}
                              </h3>
                              <div className="flex items-center gap-3 mt-2">
                                <HealthScoreBadge 
                                  score={healthScore.score} 
                                  category={healthScore.category}
                                />
                                {client.planner && (
                                  <Badge variant="outline" className="text-xs">
                                    {client.planner}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                Score: <span className="font-semibold">{healthScore.score}</span>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingClient(client)}
                              className="flex items-center gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              Ver Detalhes
                            </Button>
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
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <span className="text-sm">NPS</span>
                                <span className="font-semibold">{healthScore.breakdown.nps} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <span className="text-sm">Indicação</span>
                                <span className="font-semibold">{healthScore.breakdown.referral} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <span className="text-sm">Inadimplência</span>
                                <span className="font-semibold">{healthScore.breakdown.payment} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <span className="text-sm">Cross Sell</span>
                                <span className="font-semibold">{healthScore.breakdown.crossSell} pts</span>
                              </div>
                              <div className={`flex items-center justify-between p-3 rounded-lg md:col-span-2 ${isDarkMode ? 'bg-gray-800' : 'bg-gray-100'}`}>
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
                          <RechartsTooltip 
                            contentStyle={{
                              backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
                              border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb',
                              borderRadius: '8px',
                              color: isDarkMode ? '#f9fafb' : '#111827'
                            }}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="score" 
                            stroke={isDarkMode ? '#3b82f6' : '#2563eb'} 
                            strokeWidth={2}
                            dot={{ fill: isDarkMode ? '#3b82f6' : '#2563eb', r: 4 }}
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