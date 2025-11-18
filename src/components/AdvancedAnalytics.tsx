import React, { useState } from 'react';
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

  // Metadata dos módulos (sem os componentes para evitar cache)
  const analyticsModules = [
    {
      id: 'portfolio',
      title: 'Portfolio Health Metrics',
      description: 'Métricas agregadas da carteira',
      icon: BarChart3
    },
    {
      id: 'movement',
      title: 'Movement Sankey',
      description: 'Fluxo entre categorias',
      icon: Waves
    }
  ];

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

        {/* Conteúdo dos Módulos - Renderizar diretamente para evitar cache */}
        <TabsContent value="portfolio" className="space-y-6">
          <PortfolioMetrics
            clients={clients}
            selectedPlanner={selectedPlanner}
            manager={manager}
            mediator={mediator}
            leader={leader}
            isDarkMode={isDarkMode}
          />
        </TabsContent>

        <TabsContent value="movement" className="space-y-6">
          <MovementSankey
            clients={clients}
            selectedPlanner={selectedPlanner}
            manager={manager}
            mediator={mediator}
            leader={leader}
            isDarkMode={isDarkMode}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdvancedAnalytics;
