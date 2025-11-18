import React, { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  BarChart3, 
  Trophy, 
  Thermometer, 
  Link, 
  Waves, 
  TrendingUp,
  Users,
  Target
} from 'lucide-react';
import { Client, Planner } from '@/types/client';
import PortfolioMetrics from './PortfolioMetrics';
import MovementSankey from './MovementSankey';
import { AnalysisInfoTooltip } from './AnalysisInfoTooltip';

interface AdvancedAnalyticsProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
  manager?: string | 'all';
  mediator?: string | 'all';
  leader?: string | 'all';
}

const AdvancedAnalytics: React.FC<AdvancedAnalyticsProps> = ({ 
  clients, 
  selectedPlanner, 
  isDarkMode = false,
  manager = 'all',
  mediator = 'all',
  leader = 'all'
}) => {
  const [activeTab, setActiveTab] = useState('portfolio');

  // useMemo para garantir que os componentes sejam recriados quando os filtros mudam
  const analyticsModules = useMemo(() => [
    {
      id: 'portfolio',
      title: 'Portfolio Health Metrics',
      description: 'Métricas agregadas da carteira',
      icon: BarChart3,
      component: <PortfolioMetrics clients={clients} selectedPlanner={selectedPlanner} manager={manager} mediator={mediator} leader={leader} isDarkMode={isDarkMode} />
    },
    {
      id: 'movement',
      title: 'Movement Sankey',
      description: 'Fluxo entre categorias',
      icon: Waves,
      component: <MovementSankey clients={clients} selectedPlanner={selectedPlanner} manager={manager} mediator={mediator} leader={leader} isDarkMode={isDarkMode} />
    }
  ], [clients, selectedPlanner, manager, mediator, leader, isDarkMode]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Análises Avançadas
          </h2>
          <AnalysisInfoTooltip
            title="Análises Avançadas"
            description="Esta seção oferece análises avançadas e especializadas, incluindo métricas de portfólio e visualização de movimentação entre categorias."
            tips={[
              "Use as Métricas de Portfólio para uma visão agregada da saúde da carteira",
              "O Movement Sankey mostra como clientes migram entre categorias ao longo do tempo",
              "Compare diferentes períodos para entender mudanças de longo prazo",
              "Use os filtros para analisar subconjuntos específicos da carteira"
            ]}
          />
        </div>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Funcionalidades analíticas avançadas para insights profundos
          {selectedPlanner && selectedPlanner !== "all" && ` - ${selectedPlanner}`}
        </p>
      </div>

      {/* Tabs de Módulos */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          {analyticsModules.map((module) => {
            const Icon = module.icon;
            return (
              <TabsTrigger 
                key={module.id} 
                value={module.id}
                className="flex items-center gap-2 text-xs"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{module.title}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Conteúdo dos Módulos */}
        {analyticsModules.map((module) => (
          <TabsContent key={module.id} value={module.id} className="space-y-6">
            {module.component}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default AdvancedAnalytics;
