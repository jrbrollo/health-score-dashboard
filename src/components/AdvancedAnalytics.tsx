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
import AdvancedTrends from './AdvancedTrends';

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

  const analyticsModules = [
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
    },
    {
      id: 'trends',
      title: 'Análise de Tendências',
      description: 'Padrões temporais avançados',
      icon: TrendingUp,
      component: <AdvancedTrends clients={clients} selectedPlanner={selectedPlanner} isDarkMode={isDarkMode} manager={manager} mediator={mediator} leader={leader} />
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Análises Avançadas
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Funcionalidades analíticas avançadas para insights profundos
            {selectedPlanner && selectedPlanner !== "all" && ` - ${selectedPlanner}`}
          </p>
        </div>
      </div>

      {/* Tabs de Módulos */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
