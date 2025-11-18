import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
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
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Label, LabelList, LineChart, Line, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { Client, Planner } from '@/types/client';
import { calculateHealthScore } from '@/utils/healthScore';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from './ui/drawer';
import { HealthScoreBadge } from './HealthScoreBadge';
import { temporalService } from '@/services/temporalService';
import { HealthScoreHistory } from '@/types/temporal';
import { format, subDays, startOfDay, differenceInCalendarDays } from 'date-fns';
import { MIN_HISTORY_DATE, clampToMinHistoryDate } from '@/lib/constants';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

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

const DEFAULT_DAYS = 30;
const QUICK_RANGES = [
  { label: '30 dias', value: 30 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
  { label: 'Ano atual', value: null }, // Será calculado dinamicamente
];

const MovementSankey: React.FC<MovementSankeyProps> = ({ clients, selectedPlanner, manager = 'all', mediator = 'all', leader = 'all', isDarkMode = false }) => {
  // Debug: Log dos props recebidos
  console.log('🔍 MovementSankey props recebidos:', { manager, mediator, leader, selectedPlanner, totalClients: clients.length });

  const [movementData, setMovementData] = useState<MovementData[]>([]);
  const [categoryFlows, setCategoryFlows] = useState<CategoryFlow[]>([]);
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<string>('');
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
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = startOfDay(subDays(today, DEFAULT_DAYS));
    // Garantir que data inicial não seja anterior à data mínima confiável
    const safeFromDate = clampToMinHistoryDate(fromDate);
    return {
      from: safeFromDate,
      to: today
    };
  });
  const [startDateHistory, setStartDateHistory] = useState<Map<string, HealthScoreHistory>>(new Map());
  const [endDateHistory, setEndDateHistory] = useState<Map<string, HealthScoreHistory>>(new Map());
  
  // Cache de histórico para evitar re-buscar os mesmos dados
  const historyCache = useRef<Map<string, Map<string, HealthScoreHistory>>>(new Map());
  
  // Cache de Health Scores calculados
  const healthScoreCache = useRef<Map<string, ReturnType<typeof calculateHealthScore>>>(new Map());

  // Cache para dados calculados (movements, flows, trends)
  const dataCacheRef = useRef<{
    clientsHash: string;
    dateRangeHash: string;
    movementData: MovementData[];
    categoryFlows: CategoryFlow[];
    trendAnalysis: TrendAnalysis | null;
  }>({
    clientsHash: '',
    dateRangeHash: '',
    movementData: [],
    categoryFlows: [],
    trendAnalysis: null
  });

  // Ref para preservar scroll position
  const scrollPositionRef = useRef<number>(0);

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

  // Buscar histórico de clientes em uma data específica
  // CORREÇÃO v2: Query direta em health_score_history ao invés de RPC bugado
  const loadClientHistoryForDate = useCallback(async (targetDate: Date, clientIds: (string | number)[]): Promise<Map<string, HealthScoreHistory>> => {
    const historyMap = new Map<string, HealthScoreHistory>();

    if (clientIds.length === 0) return historyMap;

    try {
      const dateStr = targetDate.toISOString().split('T')[0];
      const cacheKey = `${dateStr}-${clientIds.length}`;

      // Verificar cache primeiro
      if (historyCache.current.has(cacheKey)) {
        const cached = historyCache.current.get(cacheKey)!;
        // Verificar se todos os clientIds estão no cache
        const allCached = clientIds.every(id => cached.has(String(id)));
        if (allCached) {
          console.log(`✅ Usando cache para ${clientIds.length} clientes até ${dateStr}`);
          return cached;
        }
      }

      console.log(`🔍 Buscando histórico para ${clientIds.length} clientes na data ${dateStr} diretamente do banco...`);

      // Log dos filtros aplicados
      const appliedFilters = {
        date: dateStr,
        planner: selectedPlanner !== 'all' ? selectedPlanner : 'all',
        manager: manager !== 'all' ? manager : 'all',
        mediator: mediator !== 'all' ? mediator : 'all',
        leader: leader !== 'all' ? leader : 'all'
      };
      console.log('🔍 Aplicando filtros de hierarquia:', appliedFilters);

      setLoadingProgress(`Buscando histórico para ${clientIds.length} clientes...`);

      // Query direta na tabela health_score_history
      // Mesma lógica da correção temporal: WHERE recorded_date = date (não <=)
      // NOTA: Não filtramos por client_id aqui para evitar URLs muito longas (>1000 UUIDs)
      // Os filtros de hierarquia (planner, manager, mediator, leader) já são suficientes
      let query = supabase
        .from('health_score_history')
        .select('*')
        .eq('recorded_date', dateStr);

      // Aplicar filtros de hierarquia (normalizar para lowercase para match com banco)
      if (selectedPlanner !== 'all') {
        query = query.eq('planner', selectedPlanner);
      }

      if (manager !== 'all') {
        query = query.eq('manager', manager.toLowerCase());
      }

      if (mediator !== 'all') {
        query = query.eq('mediator', mediator.toLowerCase());
      }

      if (leader !== 'all') {
        query = query.eq('leader', leader.toLowerCase());
      }

      // Filtrar planner '0'
      query = query.neq('planner', '0');

      const { data, error } = await query;

      console.log(`✅ Filtros aplicados: retornou ${data?.length || 0} registros para ${dateStr}`);

      // Debug: mostrar amostra de mediadores nos dados retornados
      if (data && data.length > 0 && mediator !== 'all') {
        const mediatorsInData = new Set(data.map(d => d.mediator).filter(Boolean));
        console.log(`📊 Mediadores encontrados no histórico (${dateStr}):`, Array.from(mediatorsInData));
      }

      if (error) {
        console.error(`❌ Erro ao buscar histórico:`, error);
        throw error;
      }

      if (!data || !Array.isArray(data)) {
        console.warn(`⚠️ Query retornou dados inválidos:`, data);
        return historyMap;
      }

      console.log(`✅ Query retornou ${data.length} registros para ${dateStr}`);

      // Converter resultados para HealthScoreHistory
      const latestByClient = new Map<string, HealthScoreHistory>();

      data.forEach((record: any) => {
        const clientId = String(record.client_id);
        latestByClient.set(clientId, databaseToHealthScoreHistory(record));
      });

      // Salvar no cache
      historyCache.current.set(cacheKey, latestByClient);

      // Limitar tamanho do cache (manter apenas últimos 10)
      if (historyCache.current.size > 10) {
        const firstKey = historyCache.current.keys().next().value;
        historyCache.current.delete(firstKey);
      }

      console.log(`✅ Processados ${latestByClient.size} clientes do histórico`);
      return latestByClient;
    } catch (error) {
      console.error('❌ Erro ao carregar histórico:', error);
      return historyMap;
    }
  }, [selectedPlanner, manager, mediator, leader]);

  // Função auxiliar para converter dados do banco
  const databaseToHealthScoreHistory = (dbData: any): HealthScoreHistory => {
    const parseDate = (value: any) => {
      if (!value) return new Date();
      if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
      const text = value.toString();
      const isoDate = text.includes('T') ? text.split('T')[0] : text;
      const [yearStr, monthStr, dayStr] = isoDate.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        return new Date(year, month - 1, day);
      }
      return new Date();
    };

    return {
      id: dbData.id,
      clientId: dbData.client_id,
      recordedDate: parseDate(dbData.recorded_date),
      clientName: dbData.client_name,
      planner: dbData.planner,
      healthScore: dbData.health_score,
      healthCategory: dbData.health_category,
      breakdown: {
        nps: dbData.nps_score_v3_pillar ?? 0,
        referral: dbData.referral_pillar ?? 0,
        payment: dbData.payment_pillar ?? 0,
        crossSell: dbData.cross_sell_pillar ?? 0,
        tenure: dbData.tenure_pillar ?? 0,
        meetingEngagement: dbData.meeting_engagement ?? 0,
        appUsage: dbData.app_usage ?? 0,
        paymentStatus: dbData.payment_status ?? 0,
        ecosystemEngagement: dbData.ecosystem_engagement ?? 0,
        npsScore: dbData.nps_score ?? 0,
      },
      originalData: {
        lastMeeting: dbData.last_meeting,
        hasScheduledMeeting: dbData.has_scheduled_meeting,
        appUsageStatus: dbData.app_usage_status,
        paymentStatusDetail: dbData.payment_status_detail,
        hasReferrals: dbData.has_referrals,
        npsScoreDetail: dbData.nps_score_detail,
        ecosystemUsage: dbData.ecosystem_usage,
      },
      createdAt: new Date(dbData.created_at || new Date()),
    };
  };

  // Gerar dados de movimento baseados em comparação temporal real
  const generateMovementData = async (): Promise<MovementData[]> => {
    const movements: MovementData[] = [];

    console.log(`📊 Total de clientes filtrados no estado atual: ${filteredClients.length}`);
    if (mediator !== 'all') {
      const mediatorsInFiltered = new Set(filteredClients.map(c => c.mediator).filter(Boolean));
      console.log(`📊 Mediadores encontrados nos clientes filtrados:`, Array.from(mediatorsInFiltered));
    }

    const clientIds = filteredClients.map(c => String(c.id));

    const startDate = new Date(dateRange.from);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateRange.to);
    endDate.setHours(0, 0, 0, 0);
    
    // Verificar se estamos comparando a mesma data
    const isSameDate = startDate.getTime() === endDate.getTime();
    
    // SEMPRE buscar histórico na data inicial, mesmo que seja o primeiro dia
    // No dia 13/11, os clientes já tinham categorias (Ótimo, Estável, Atenção, Crítico)
    let startHistory: Map<string, HealthScoreHistory>;
    if (isSameDate) {
      // Se as datas forem iguais, não há movimento para comparar
      startHistory = new Map();
      console.log('📅 Mesma data selecionada - não há movimento para comparar');
    } else {
      // Buscar histórico na data inicial (sempre, mesmo que seja 13/11)
      startHistory = await loadClientHistoryForDate(dateRange.from, clientIds);
      console.log(`📅 Histórico inicial (${format(startDate, 'dd/MM/yyyy')}): ${startHistory.size} clientes encontrados`);
    }
    setStartDateHistory(startHistory);

    // ✅ CORREÇÃO DE BUG: SEMPRE buscar histórico do banco primeiro, mesmo para hoje
    // Só usar estado atual como fallback se não houver histórico
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let endHistory: Map<string, HealthScoreHistory>;

    // SEMPRE buscar histórico do banco primeiro
    endHistory = await loadClientHistoryForDate(endDate, clientIds);

    // CORREÇÃO: Não usar fallback - só mostrar movimentações se houver dados históricos reais
    if (endHistory.size === 0) {
      console.log(`⚠️ Sem histórico para ${format(endDate, 'dd/MM/yyyy')} - não é possível calcular movimentações`);
      setEndDateHistory(new Map());
      setStartDateHistory(startHistory);

      // Retornar vazio para indicar que não há dados suficientes
      return [];
    } else {
      console.log(`✅ Usando histórico do banco para ${format(endDate, 'dd/MM/yyyy')}: ${endHistory.size} clientes encontrados`);
    }

    setEndDateHistory(endHistory);
    
    console.log(`📊 Comparando histórico:`);
    console.log(`   - Data inicial (${format(startDate, 'dd/MM/yyyy')}): ${startHistory.size} clientes`);
    console.log(`   - Data final (${format(endDate, 'dd/MM/yyyy')}): ${endHistory.size} clientes`);
    console.log(`   - Total de clientes filtrados: ${filteredClients.length}`);

    // Comparar estados e calcular movimentos reais
    const movementMap = new Map<string, { from: string; to: string; clients: Client[] }>();
    
    // Se as datas forem iguais, não há movimento para comparar
    if (isSameDate) {
      console.log('⚠️ Mesma data selecionada - não há movimento para comparar');
      return [];
    }
    
    filteredClients.forEach(client => {
      const clientIdStr = String(client.id);
      const startState = startHistory.get(clientIdStr);
      const endState = endHistory.get(clientIdStr);
      
      // Verificar se os históricos são da data exata ou do mais recente até aquela data
      const startDateExact = startState ? 
        (new Date(startState.recordedDate).setHours(0, 0, 0, 0) === startDate.getTime()) : false;
      const endDateExact = endState ? 
        (new Date(endState.recordedDate).setHours(0, 0, 0, 0) === endDate.getTime()) : false;
      
      // Se não tem estado inicial, considerar como novo cliente
      // (só acontece se o cliente não estava na data inicial)
      if (!startState) {
        if (endState) {
          const key = `Novo → ${endState.healthCategory}`;
          if (!movementMap.has(key)) {
            movementMap.set(key, { from: 'Novo', to: endState.healthCategory, clients: [] });
          }
          movementMap.get(key)!.clients.push(client);
        }
        return;
      }
      
      // Se não tem estado final, considerar como cliente perdido
      // (só acontece se o cliente não estava na data final)
      if (!endState) {
        const key = `${startState.healthCategory} → Perdido`;
        if (!movementMap.has(key)) {
          movementMap.set(key, { from: startState.healthCategory, to: 'Perdido', clients: [] });
        }
        movementMap.get(key)!.clients.push(client);
        return;
      }
      
      // IMPORTANTE: Se o estado final não é da data exata, pode ser que não haja histórico para aquela data
      // Nesse caso, usar o estado mais recente disponível, mas logar para debug
      if (!endDateExact && endState) {
        const endRecordDate = new Date(endState.recordedDate);
        endRecordDate.setHours(0, 0, 0, 0);
        if (endRecordDate.getTime() < endDate.getTime()) {
          // O histórico é de uma data anterior à data final
          // Isso significa que não há histórico exato para a data final
          // Usar o histórico mais recente disponível, mas pode não ser preciso
          console.log(`⚠️ Cliente ${client.name} (${clientIdStr}) não tem histórico exato para ${format(endDate, 'dd/MM/yyyy')}, usando histórico de ${format(endRecordDate, 'dd/MM/yyyy')}`);
        }
      }
      
      // Comparar categorias e registrar movimento
      // Se mudou de categoria, registrar movimento
      // Se ficou na mesma categoria, registrar como estável
      if (startState.healthCategory !== endState.healthCategory) {
        const key = `${startState.healthCategory} → ${endState.healthCategory}`;
        if (!movementMap.has(key)) {
          movementMap.set(key, { from: startState.healthCategory, to: endState.healthCategory, clients: [] });
        }
        movementMap.get(key)!.clients.push(client);
      } else {
        // Cliente ficou na mesma categoria (estável)
        const key = `${startState.healthCategory} → ${endState.healthCategory}`;
        if (!movementMap.has(key)) {
          movementMap.set(key, { from: startState.healthCategory, to: endState.healthCategory, clients: [] });
        }
        movementMap.get(key)!.clients.push(client);
      }
    });

    // Converter para formato MovementData
    const movementsData: MovementData[] = Array.from(movementMap.entries())
      .filter(([_, movement]) => movement.from !== 'Perdido') // Manter filtro: não permitir movimentos DE 'Perdido' (cliente já perdido não pode partir de estado perdido)
      // Removido filtro movement.to !== 'Perdido': movimentos PARA 'Perdido' são dados críticos de negócio e devem ser exibidos
      .map(([_, movement]) => ({
        from: movement.from,
        to: movement.to,
        value: movement.clients.length,
        clients: movement.clients.map(c => c.name),
        clientObjects: movement.clients
      }))
      .filter(m => m.value > 0);
    
    console.log(`✅ Movimentos calculados: ${movementsData.length} tipos diferentes`);
    movementsData.forEach(m => {
      console.log(`   - ${m.from} → ${m.to}: ${m.value} clientes`);
    });

    return movementsData;
  };

  // Calcular fluxos por categoria (OTIMIZADO - memoiza Health Scores)
  const calculateCategoryFlows = useCallback((movements: MovementData[], allClients: Client[]): CategoryFlow[] => {
    const categories = ['Ótimo', 'Estável', 'Atenção', 'Crítico'];
    
    // OTIMIZAÇÃO: Calcular todos os Health Scores uma única vez e cachear
    const scoresByClientId = new Map<string, ReturnType<typeof calculateHealthScore>>();
    allClients.forEach(client => {
      const cacheKey = String(client.id);
      if (!healthScoreCache.current.has(cacheKey)) {
        healthScoreCache.current.set(cacheKey, calculateHealthScore(client));
      }
      scoresByClientId.set(cacheKey, healthScoreCache.current.get(cacheKey)!);
    });
    
    // Criar mapa de nomes para clientes para busca rápida
    const clientsByName = new Map<string, Client>();
    allClients.forEach(client => {
      clientsByName.set(client.name, client);
    });
    
    return categories.map(category => {
      const incoming = movements
        .filter(m => m.to === category)
        .reduce((sum, m) => sum + m.value, 0);
      
      const outgoing = movements
        .filter(m => m.from === category)
        .reduce((sum, m) => sum + m.value, 0);
      
      const netChange = incoming - outgoing;
      
      const clientNames = [
        ...movements.filter(m => m.to === category).flatMap(m => m.clients),
        ...movements.filter(m => m.from === category).flatMap(m => m.clients)
      ];

      // OTIMIZAÇÃO: Obter objetos de clientes completos para esta categoria usando scores já calculados
      const clientObjects = allClients.filter(client => {
        const score = scoresByClientId.get(String(client.id));
        return score?.category === category;
      });

      return {
        category,
        incoming,
        outgoing,
        netChange,
        clients: [...new Set(clientNames)], // Remove duplicatas de nomes
        clientObjects
      };
    });
  }, []);

  // Análise de tendências baseada em comparação temporal real (OTIMIZADO)
  const calculateTrendAnalysis = useCallback((movements: MovementData[], clients: Client[]): TrendAnalysis => {
    const categoryRank = { 'Crítico': 1, 'Atenção': 2, 'Estável': 3, 'Ótimo': 4 };
    
    // Clientes melhorando: mudaram de categoria pior para melhor
    const improvingClients: Client[] = [];
    movements.forEach(movement => {
      // Ignorar movimentos de "Novo", "Perdido" e movimentos estáveis (from === to)
      if (movement.from === 'Novo' || movement.to === 'Perdido' || movement.from === movement.to) {
        return;
      }
      const fromRank = categoryRank[movement.from as keyof typeof categoryRank] || 0;
      const toRank = categoryRank[movement.to as keyof typeof categoryRank] || 0;
      if (toRank > fromRank) {
        improvingClients.push(...movement.clientObjects);
      }
    });
    
    // Clientes piorando: mudaram de categoria melhor para pior
    const decliningClients: Client[] = [];
    movements.forEach(movement => {
      // Ignorar movimentos de "Novo", "Perdido" e movimentos estáveis (from === to)
      if (movement.from === 'Novo' || movement.to === 'Perdido' || movement.from === movement.to) {
        return;
      }
      const fromRank = categoryRank[movement.from as keyof typeof categoryRank] || 0;
      const toRank = categoryRank[movement.to as keyof typeof categoryRank] || 0;
      if (toRank < fromRank) {
        decliningClients.push(...movement.clientObjects);
      }
    });
    
    // Clientes estáveis: ficaram na mesma categoria (from === to)
    const stableClients: Client[] = [];
    movements.forEach(movement => {
      // Ignorar movimentos de "Novo" e "Perdido"
      if (movement.from === 'Novo' || movement.to === 'Perdido') {
        return;
      }
      // Se from === to, o cliente ficou estável
      if (movement.from === movement.to) {
        stableClients.push(...movement.clientObjects);
      }
    });
    
    // Novos clientes: aparecem em movimentos com "Novo" como origem
    const newClientsList: Client[] = [];
    movements.forEach(movement => {
      if (movement.from === 'Novo') {
        newClientsList.push(...movement.clientObjects);
      }
    });
    
    // Clientes perdidos: movimentos para "Perdido" (agora exibidos após correção do filtro)
    const lostClientsList: Client[] = [];
    movements.forEach(movement => {
      if (movement.to === 'Perdido') {
        lostClientsList.push(...movement.clientObjects);
      }
    });
    
    return {
      improving: improvingClients.length,
      declining: decliningClients.length,
      stable: stableClients.length,
      newClients: newClientsList.length,
      lostClients: lostClientsList.length,
      improvingClients,
      decliningClients,
      stableClients,
      newClientsList,
      lostClientsList
    };
  }, []);

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

  // Função para gerar hash dos IDs dos clientes e dateRange (comparação profunda)
  const generateDataHash = (clientsList: Client[], range: { from: Date; to: Date }): { clientsHash: string; dateRangeHash: string } => {
    const sortedIds = clientsList
      .map(c => String(c.id))
      .sort()
      .join(',');
    const clientsHash = `${sortedIds.length}-${selectedPlanner}-${manager}-${mediator}-${leader}-${sortedIds.slice(0, 100)}`;
    const dateRangeHash = `${range.from.toISOString().split('T')[0]}-${range.to.toISOString().split('T')[0]}`;
    return { clientsHash, dateRangeHash };
  };

  useEffect(() => {
    const loadData = async () => {
      if (filteredClients.length === 0) {
        setLoading(false);
        setMovementData([]);
        setCategoryFlows([]);
        setTrendAnalysis(null);
        return;
      }
      
      // Gerar hash para comparação
      const { clientsHash, dateRangeHash } = generateDataHash(filteredClients, dateRange);
      
      // Se os dados são os mesmos (mesmo hash), não recarregar
      if (
        dataCacheRef.current.clientsHash === clientsHash &&
        dataCacheRef.current.dateRangeHash === dateRangeHash &&
        dataCacheRef.current.movementData.length > 0
      ) {
        // Dados já estão em cache, apenas restaurar do cache
        setMovementData(dataCacheRef.current.movementData);
        setCategoryFlows(dataCacheRef.current.categoryFlows);
        setTrendAnalysis(dataCacheRef.current.trendAnalysis);
        setLoading(false);
        setLoadingProgress('');
        return;
      }

      // Preservar scroll position antes de mostrar loading
      scrollPositionRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop;

      // Só mostrar loading se realmente não temos dados ainda
      const hasData = dataCacheRef.current.movementData.length > 0;
      if (!hasData) {
      setLoading(true);
        setLoadingProgress('Iniciando análise...');
      }
      console.log('🔄 Iniciando carregamento de dados de movimento...');
      
      try {
        // Limpar cache de Health Scores quando mudar o conjunto de clientes
        healthScoreCache.current.clear();
        
        if (!hasData) {
          setLoadingProgress('Calculando movimentos...');
        }
        const movements = await generateMovementData();
        console.log(`✅ Movimentos calculados: ${movements.length}`);
        
        if (!hasData) {
          setLoadingProgress('Processando fluxos e tendências...');
        }
        const flows = calculateCategoryFlows(movements, filteredClients);
        const trends = calculateTrendAnalysis(movements, filteredClients);
        
        // Atualizar cache
        dataCacheRef.current = {
          clientsHash,
          dateRangeHash,
          movementData: movements,
          categoryFlows: flows,
          trendAnalysis: trends
        };
        
        setMovementData(movements);
        setCategoryFlows(flows);
        setTrendAnalysis(trends);
        console.log('✅ Dados de movimento carregados com sucesso');
      } catch (error) {
        console.error('❌ Erro ao carregar dados de movimento:', error);
        setMovementData([]);
        setCategoryFlows([]);
        setTrendAnalysis(null);
      } finally {
        setLoading(false);
        setLoadingProgress('');

        // Restaurar scroll position após um pequeno delay para garantir que o DOM foi atualizado
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (scrollPositionRef.current > 0) {
              window.scrollTo({
                top: scrollPositionRef.current,
                behavior: 'instant' as ScrollBehavior
              });
            }
          });
        });
      }
    };
    
    loadData();
  }, [filteredClients, dateRange, loadClientHistoryForDate, calculateCategoryFlows, calculateTrendAnalysis, selectedPlanner, manager, mediator, leader]);

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
      case 'Perdido':
        return isDarkMode ? '#991b1b' : '#dc2626'; // Vermelho escuro para destacar clientes perdidos
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
          <p className="text-gray-500 dark:text-gray-400">Carregando análise de movimentos...</p>
          {loadingProgress && (
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">{loadingProgress}</p>
          )}
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

      {/* Seletor de Período */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Período de Análise
          </CardTitle>
          <CardDescription>
            Selecione o período para comparar mudanças de categoria dos clientes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1">
              <DatePickerWithRange
                date={dateRange}
                onDateChange={(range) => {
                  if (range?.from) {
                    const from = startOfDay(range.from);
                    
                    // Garantir que data não seja anterior à data mínima confiável
                    // Mas permitir selecionar qualquer data >= MIN_HISTORY_DATE
                    const safeFrom = clampToMinHistoryDate(from);
                    
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const to = range?.to 
                      ? startOfDay(range.to.getTime() > today.getTime() ? today : range.to)
                      : startOfDay(safeFrom.getTime() > today.getTime() ? today : safeFrom);
                    
                    setDateRange({ from: safeFrom, to });
                  }
                }}
                minDate={MIN_HISTORY_DATE}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_RANGES.map((range) => {
                const handleQuickRange = () => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (range.value === null) {
                    // Ano atual - mas garantir que não seja antes da data mínima
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    const safeYearStart = clampToMinHistoryDate(startOfDay(yearStart));
                    setDateRange({ from: safeYearStart, to: today });
                  } else {
                    const fromDate = startOfDay(subDays(today, range.value));
                    const safeFromDate = clampToMinHistoryDate(fromDate);
                    setDateRange({
                      from: safeFromDate,
                      to: today
                    });
                  }
                };
                const isActive = range.value === null 
                  ? false // Ano atual precisa de lógica mais complexa para verificar
                  : differenceInCalendarDays(dateRange.to, dateRange.from) === range.value;
                
                return (
                  <Button
                    key={range.label}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    onClick={handleQuickRange}
                  >
                    {range.label}
                  </Button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            <p>
              Comparando estado dos clientes de{' '}
              <span className="font-semibold">{format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })}</span>
              {' '}até{' '}
              <span className="font-semibold">{format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Aviso: Sem dados históricos suficientes */}
      {!loading && movementData.length === 0 && endDateHistory.size === 0 && (
        <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                  Dados históricos insuficientes
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                  Não há dados históricos disponíveis para a data final selecionada ({format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}).
                  Por favor, selecione uma data que já tenha importação de planilha realizada, ou aguarde a importação dos dados.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Análise de Tendências */}
      {trendAnalysis && movementData.length > 0 && (
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
      {movementData.length > 0 && (
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
      )}

      {/* Análise por Categoria */}
      {movementData.length > 0 && (
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
      )}

      {/* Distribuição de Movimentos */}
      {movementData.length > 0 && (
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
      )}

      {/* Legenda */}
      {movementData.length > 0 && (
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-5 w-5" />
            Legenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: getCategoryColor('Perdido') }}></div>
              <span className="text-sm">Perdido</span>
            </div>
          </div>
        </CardContent>
        </Card>
      )}

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
                            domain={[0, 100]}
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
