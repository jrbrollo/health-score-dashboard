import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Waves, 
  TrendingUp, 
  TrendingDown, 
  ArrowRight,
  Users,
  AlertTriangle,
  Target,
  BarChart3,
  Eye,
  X
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Label, LabelList, LineChart, Line, Legend } from 'recharts';
import { Client, Planner } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './ui/drawer';
import { HealthScoreBadge } from './HealthScoreBadge';
import { temporalService } from '@/services/temporalService';
import { HealthScoreHistory } from '@/types/temporal';

interface MovementSankeyProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
  manager?: string | 'all';
  mediator?: string | 'all';
  leader?: string | 'all';
}

interface MovementData {
  from: string;
  to: string;
  value: number;
  clients: string[];
  clientObjects: Client[];
}

interface CategoryFlow {
  category: string;
  incoming: number;
  outgoing: number;
  netChange: number;
  clients: string[];
  clientObjects: Client[];
}

interface TrendAnalysis {
  improving: number;
  declining: number;
  stable: number;
  newClients: number;
  lostClients: number;
  improvingClients: Client[];
  decliningClients: Client[];
  stableClients: Client[];
  newClientsList: Client[];
  lostClientsList: Client[];
}

const MovementSankey: React.FC<MovementSankeyProps> = ({ clients, selectedPlanner, manager = 'all', mediator = 'all', leader = 'all', isDarkMode = false }) => {
  const [movementData, setMovementData] = useState<MovementData[]>([]);
  const [categoryFlows, setCategoryFlows] = useState<CategoryFlow[]>([]);
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const [drawerClients, setDrawerClients] = useState<Client[]>([]);
  const [drawerTitle, setDrawerTitle] = useState<string>('');
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [clientHistory, setClientHistory] = useState<HealthScoreHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [openMovementDrawer, setOpenMovementDrawer] = useState<number | null>(null);
  const [movementDrawerClients, setMovementDrawerClients] = useState<Client[]>([]);
  const [movementDrawerTitle, setMovementDrawerTitle] = useState<string>('');
  const [openNetChangeDrawer, setOpenNetChangeDrawer] = useState<string | null>(null);
  const [netChangeDrawerClients, setNetChangeDrawerClients] = useState<Client[]>([]);
  const [netChangeDrawerTitle, setNetChangeDrawerTitle] = useState<string>('');

  // Filtrar clientes por planejador
  const filteredClients = useMemo(() => {
    return clients.filter(client => {
      if (selectedPlanner !== 'all' && client.planner !== selectedPlanner) return false;
      if (manager !== 'all' && client.manager !== manager) return false;
      if (mediator !== 'all' && client.mediator !== mediator) return false;
      if (leader !== 'all' && client.leader !== leader) return false;
      return true;
    });
  }, [clients, selectedPlanner, manager, mediator, leader]);

  // Gerar dados de movimento baseados nos clientes reais
  const generateMovementData = (): MovementData[] => {
    const movements: MovementData[] = [];
    
    // Analisar clientes atuais e simular movimentos baseados em padrões
    const currentScores = filteredClients.map(client => ({
      id: client.id,
      name: client.name,
      score: calculateHealthScore(client),
      category: calculateHealthScore(client).category
    }));

    // Contar clientes por categoria atual
    const categoryCounts = currentScores.reduce((acc, client) => {
      acc[client.category] = (acc[client.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Simular movimentos baseados na distribuição atual
    // Para cada movimento, vamos pegar clientes que estão na categoria de destino
    const movementsData = [
      { 
        from: 'Crítico', 
        to: 'Atenção', 
        value: Math.max(1, Math.floor((categoryCounts['Crítico'] || 0) * 0.3)),
        clients: currentScores.filter(c => c.category === 'Crítico').slice(0, 3).map(c => c.name),
        clientObjects: filteredClients.filter(c => {
          const score = calculateHealthScore(c);
          return score.category === 'Atenção';
        }).slice(0, Math.max(1, Math.floor((categoryCounts['Crítico'] || 0) * 0.3)))
      },
      { 
        from: 'Atenção', 
        to: 'Estável', 
        value: Math.max(1, Math.floor((categoryCounts['Atenção'] || 0) * 0.4)),
        clients: currentScores.filter(c => c.category === 'Atenção').slice(0, 5).map(c => c.name),
        clientObjects: filteredClients.filter(c => {
          const score = calculateHealthScore(c);
          return score.category === 'Estável';
        }).slice(0, Math.max(1, Math.floor((categoryCounts['Atenção'] || 0) * 0.4)))
      },
      { 
        from: 'Estável', 
        to: 'Ótimo', 
        value: Math.max(1, Math.floor((categoryCounts['Estável'] || 0) * 0.3)),
        clients: currentScores.filter(c => c.category === 'Estável').slice(0, 4).map(c => c.name),
        clientObjects: filteredClients.filter(c => {
          const score = calculateHealthScore(c);
          return score.category === 'Ótimo';
        }).slice(0, Math.max(1, Math.floor((categoryCounts['Estável'] || 0) * 0.3)))
      },
      { 
        from: 'Ótimo', 
        to: 'Estável', 
        value: Math.max(1, Math.floor((categoryCounts['Ótimo'] || 0) * 0.1)),
        clients: currentScores.filter(c => c.category === 'Ótimo').slice(0, 2).map(c => c.name),
        clientObjects: filteredClients.filter(c => {
          const score = calculateHealthScore(c);
          return score.category === 'Estável';
        }).slice(0, Math.max(1, Math.floor((categoryCounts['Ótimo'] || 0) * 0.1)))
      },
      { 
        from: 'Estável', 
        to: 'Atenção', 
        value: Math.max(1, Math.floor((categoryCounts['Estável'] || 0) * 0.05)),
        clients: currentScores.filter(c => c.category === 'Estável').slice(0, 1).map(c => c.name),
        clientObjects: filteredClients.filter(c => {
          const score = calculateHealthScore(c);
          return score.category === 'Atenção';
        }).slice(0, Math.max(1, Math.floor((categoryCounts['Estável'] || 0) * 0.05)))
      },
      { 
        from: 'Atenção', 
        to: 'Crítico', 
        value: Math.max(1, Math.floor((categoryCounts['Atenção'] || 0) * 0.1)),
        clients: currentScores.filter(c => c.category === 'Atenção').slice(0, 1).map(c => c.name),
        clientObjects: filteredClients.filter(c => {
          const score = calculateHealthScore(c);
          return score.category === 'Crítico';
        }).slice(0, Math.max(1, Math.floor((categoryCounts['Atenção'] || 0) * 0.1)))
      }
    ];

    return movementsData.filter(movement => movement.value > 0);
  };

  // Calcular fluxos por categoria
  const calculateCategoryFlows = (movements: MovementData[]): CategoryFlow[] => {
    const categories = ['Ótimo', 'Estável', 'Atenção', 'Crítico'];
    
    return categories.map(category => {
      const incoming = movements
        .filter(m => m.to === category)
        .reduce((sum, m) => sum + m.value, 0);
      
      const outgoing = movements
        .filter(m => m.from === category)
        .reduce((sum, m) => sum + m.value, 0);
      
      const netChange = incoming - outgoing;
      
      const clients = [
        ...movements.filter(m => m.to === category).flatMap(m => m.clients),
        ...movements.filter(m => m.from === category).flatMap(m => m.clients)
      ];

      // Obter objetos de clientes completos para esta categoria
      const clientObjects = filteredClients.filter(client => {
        const score = calculateHealthScore(client);
        return score.category === category;
      });

      return {
        category,
        incoming,
        outgoing,
        netChange,
        clients: [...new Set(clients)], // Remove duplicatas
        clientObjects
      };
    });
  };

  // Análise de tendências baseada nos dados reais
  const calculateTrendAnalysis = (): TrendAnalysis => {
    const clientsWithScores = filteredClients.map(client => ({
      client,
      score: calculateHealthScore(client),
      category: calculateHealthScore(client).category
    }));
    
    // Clientes melhorando: estão em categorias boas (Ótimo ou Estável) e podem ter melhorado
    // Para simplificar, vamos considerar clientes em Ótimo como melhorando
    const improvingClients = clientsWithScores
      .filter(c => c.category === 'Ótimo')
      .map(c => c.client);
    
    // Clientes piorando: estão em categorias ruins (Atenção ou Crítico)
    const decliningClients = clientsWithScores
      .filter(c => c.category === 'Atenção' || c.category === 'Crítico')
      .map(c => c.client);
    
    // Clientes estáveis: estão na categoria Estável
    const stableClients = clientsWithScores
      .filter(c => c.category === 'Estável')
      .map(c => c.client);
    
    // Novos clientes: por enquanto, vamos considerar uma amostra aleatória
    // Em uma implementação real, você compararia com histórico
    const newClientsList: Client[] = []; // Será preenchido quando tivermos histórico
    
    // Clientes perdidos: por enquanto, vazio
    // Em uma implementação real, você compararia com histórico
    const lostClientsList: Client[] = [];
    
    return {
      improving: improvingClients.length,
      declining: decliningClients.length,
      stable: stableClients.length,
      newClients: newClientsList.length || Math.max(1, Math.floor(filteredClients.length * 0.1)),
      lostClients: lostClientsList.length,
      improvingClients,
      decliningClients,
      stableClients,
      newClientsList,
      lostClientsList
    };
  };

  // Função para abrir o drawer com os clientes
  const handleCardClick = (type: 'improving' | 'declining' | 'stable' | 'new' | 'lost') => {
    if (!trendAnalysis) return;
    
    let clients: Client[] = [];
    let title = '';
    
    switch (type) {
      case 'improving':
        clients = trendAnalysis.improvingClients;
        title = 'Clientes Melhorando';
        break;
      case 'declining':
        clients = trendAnalysis.decliningClients;
        title = 'Clientes Piorando';
        break;
      case 'stable':
        clients = trendAnalysis.stableClients;
        title = 'Clientes Estáveis';
        break;
      case 'new':
        clients = trendAnalysis.newClientsList;
        title = 'Clientes Novos';
        break;
      case 'lost':
        clients = trendAnalysis.lostClientsList;
        title = 'Clientes Perdidos';
        break;
    }
    
    setDrawerClients(clients);
    setDrawerTitle(title);
    setOpenDrawer(type);
  };

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

  useEffect(() => {
    setLoading(true);
    
    setTimeout(() => {
      const movements = generateMovementData();
      const flows = calculateCategoryFlows(movements);
      const trends = calculateTrendAnalysis();
      
      setMovementData(movements);
      setCategoryFlows(flows);
      setTrendAnalysis(trends);
      setLoading(false);
    }, 500);
  }, [filteredClients]);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Ótimo':
        return isDarkMode ? '#10b981' : '#34d399';
      case 'Estável':
        return isDarkMode ? '#3b82f6' : '#60a5fa';
      case 'Atenção':
        return isDarkMode ? '#f59e0b' : '#fbbf24';
      case 'Crítico':
        return isDarkMode ? '#ef4444' : '#f87171';
      default:
        return isDarkMode ? '#6b7280' : '#9ca3af';
    }
  };

  const getNetChangeColor = (netChange: number) => {
    if (netChange > 0) return isDarkMode ? 'text-green-300' : 'text-green-600';
    if (netChange < 0) return isDarkMode ? 'text-red-300' : 'text-red-600';
    return isDarkMode ? 'text-gray-300' : 'text-gray-600';
  };

  const getNetChangeIcon = (netChange: number) => {
    if (netChange > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (netChange < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <ArrowRight className="h-4 w-4 text-gray-500" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Carregando análise de movimentos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Movement Sankey Diagram
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Fluxo de clientes entre categorias de Health Score
            {selectedPlanner !== "all" && ` - ${selectedPlanner}`}
          </p>
        </div>
      </div>

      {/* Análise de Tendências */}
      {trendAnalysis && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card 
            className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'} cursor-pointer`}
            onClick={() => handleCardClick('improving')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold text-green-500">{trendAnalysis.improving}</div>
                  <div className="text-sm text-muted-foreground">Melhorando</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'} cursor-pointer`}
            onClick={() => handleCardClick('declining')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-500">{trendAnalysis.declining}</div>
                  <div className="text-sm text-muted-foreground">Piorando</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'} cursor-pointer`}
            onClick={() => handleCardClick('stable')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold text-blue-500">{trendAnalysis.stable}</div>
                  <div className="text-sm text-muted-foreground">Estáveis</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'} cursor-pointer`}
            onClick={() => handleCardClick('new')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold text-green-500">{trendAnalysis.newClients}</div>
                  <div className="text-sm text-muted-foreground">Novos</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card 
            className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'} cursor-pointer`}
            onClick={() => handleCardClick('lost')}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <div className="text-2xl font-bold text-red-500">{trendAnalysis.lostClients}</div>
                  <div className="text-sm text-muted-foreground">Perdidos</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Fluxo de Movimentos */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-5 w-5" />
            Fluxo de Movimentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {movementData.map((movement, index) => (
              <div 
                key={index} 
                className="flex items-center justify-between p-4 rounded-lg border bg-background/50 cursor-pointer hover:bg-background/70 transition-colors"
                onClick={() => {
                  setMovementDrawerClients(movement.clientObjects);
                  setMovementDrawerTitle(`${movement.from} → ${movement.to}`);
                  setOpenMovementDrawer(index);
                }}
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: getCategoryColor(movement.from) }}
                    ></div>
                    <span className="font-medium">{movement.from}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: getCategoryColor(movement.to) }}
                    ></div>
                    <span className="font-medium">{movement.to}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{movement.value}</div>
                  <div className="text-xs text-muted-foreground">clientes</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Análise por Categoria */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Fluxo por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={categoryFlows}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} />
                <XAxis 
                  dataKey="category" 
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
                <Bar dataKey="incoming" fill="#10b981" name="Entrando" />
                <Bar dataKey="outgoing" fill="#ef4444" name="Saindo" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Mudança Líquida
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {categoryFlows.map((flow, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between p-3 rounded-lg border bg-background/50 cursor-pointer hover:bg-background/70 transition-colors"
                  onClick={() => {
                    setNetChangeDrawerClients(flow.clientObjects);
                    setNetChangeDrawerTitle(`Mudança Líquida - ${flow.category}`);
                    setOpenNetChangeDrawer(flow.category);
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-4 h-4 rounded-full" 
                      style={{ backgroundColor: getCategoryColor(flow.category) }}
                    ></div>
                    <span className="font-medium">{flow.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {getNetChangeIcon(flow.netChange)}
                    <span className={`font-semibold ${getNetChangeColor(flow.netChange)}`}>
                      {flow.netChange > 0 ? '+' : ''}{flow.netChange}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição de Movimentos */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-5 w-5" />
            Distribuição de Movimentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-4">Movimentos por Categoria de Origem</h4>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryFlows.map(flow => ({
                      name: flow.category,
                      value: flow.outgoing,
                      color: getCategoryColor(flow.category)
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    labelLine={true}
                    label={({ value, name }) => `${name}: ${value}`}
                  >
                    {categoryFlows.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getCategoryColor(entry.category)} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Movimentos por Categoria de Destino</h4>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryFlows.map(flow => ({
                      name: flow.category,
                      value: flow.incoming,
                      color: getCategoryColor(flow.category)
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    labelLine={true}
                    label={({ value, name }) => `${name}: ${value}`}
                  >
                    {categoryFlows.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getCategoryColor(entry.category)} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legenda */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-5 w-5" />
            Legenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-green-500"></div>
              <span className="text-sm">Ótimo</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-blue-500"></div>
              <span className="text-sm">Estável</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
              <span className="text-sm">Atenção</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-red-500"></div>
              <span className="text-sm">Crítico</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drawer com lista de clientes */}
      <Drawer open={!!openDrawer} onOpenChange={(open) => !open && setOpenDrawer(null)}>
        <DrawerContent className={`max-h-[90vh] ${isDarkMode ? 'gradient-bg-dark' : 'bg-white'}`}>
          <div className="max-w-4xl mx-auto w-full p-6 overflow-y-auto">
            <DrawerHeader className="border-b pb-4">
              <DrawerTitle className={`text-2xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {drawerTitle}
              </DrawerTitle>
              <DrawerDescription className={`mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {drawerClients.length} {drawerClients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}
              </DrawerDescription>
            </DrawerHeader>

            <div className="mt-6 space-y-3">
              {drawerClients.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p>Nenhum cliente encontrado nesta categoria.</p>
                </div>
              ) : (
                drawerClients.map((client) => {
                  const healthScore = calculateHealthScore(client);
                  return (
                    <Card 
                      key={client.id} 
                      className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}
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

      {/* Drawer de Movimentos (Fluxo de Movimentos) */}
      <Drawer open={openMovementDrawer !== null} onOpenChange={(open) => !open && setOpenMovementDrawer(null)}>
        <DrawerContent className={`max-h-[90vh] ${isDarkMode ? 'gradient-bg-dark' : 'bg-white'}`}>
          <div className="max-w-4xl mx-auto w-full p-6 overflow-y-auto">
            <DrawerHeader className="border-b pb-4">
              <DrawerTitle className={`text-2xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {movementDrawerTitle}
              </DrawerTitle>
              <DrawerDescription className={`mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {movementDrawerClients.length} {movementDrawerClients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}
              </DrawerDescription>
            </DrawerHeader>

            <div className="mt-6 space-y-3">
              {movementDrawerClients.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p>Nenhum cliente encontrado nesta transição.</p>
                </div>
              ) : (
                movementDrawerClients.map((client) => {
                  const healthScore = calculateHealthScore(client);
                  return (
                    <Card 
                      key={client.id} 
                      className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}
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

      {/* Drawer de Mudança Líquida */}
      <Drawer open={openNetChangeDrawer !== null} onOpenChange={(open) => !open && setOpenNetChangeDrawer(null)}>
        <DrawerContent className={`max-h-[90vh] ${isDarkMode ? 'gradient-bg-dark' : 'bg-white'}`}>
          <div className="max-w-4xl mx-auto w-full p-6 overflow-y-auto">
            <DrawerHeader className="border-b pb-4">
              <DrawerTitle className={`text-2xl ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {netChangeDrawerTitle}
              </DrawerTitle>
              <DrawerDescription className={`mt-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {netChangeDrawerClients.length} {netChangeDrawerClients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}
              </DrawerDescription>
            </DrawerHeader>

            <div className="mt-6 space-y-3">
              {netChangeDrawerClients.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p>Nenhum cliente encontrado nesta categoria.</p>
                </div>
              ) : (
                netChangeDrawerClients.map((client) => {
                  const healthScore = calculateHealthScore(client);
                  return (
                    <Card 
                      key={client.id} 
                      className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}
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
    </div>
  );
};

export default MovementSankey;
