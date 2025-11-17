import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Thermometer, 
  Users, 
  Calendar, 
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react';
import { Client, Planner } from '@/types/client';
import { calculateHealthScore, getHealthCategory } from '@/utils/healthScore';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, subMonths, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface HealthScoreHeatmapProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  isDarkMode?: boolean;
}

interface HeatmapData {
  clientId: string;
  clientName: string;
  planner: string;
  scores: { date: string; score: number; category: string }[];
}

interface CalendarDay {
  date: Date;
  score: number | null;
  category: string | null;
  clientCount: number;
}

const HealthScoreHeatmap: React.FC<HealthScoreHeatmapProps> = ({ clients, selectedPlanner, isDarkMode = false }) => {
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showOutliers, setShowOutliers] = useState(true);
  const [loading, setLoading] = useState(true);

  // Filtrar clientes por planejador
  const filteredClients = useMemo(() => {
    if (selectedPlanner === "all") return clients;
    return clients.filter(client => client.planner === selectedPlanner);
  }, [clients, selectedPlanner]);

  // Gerar dados do heatmap (simulado para demonstração)
  const generateHeatmapData = (): HeatmapData[] => {
    return filteredClients.map(client => {
      const scores = [];
      const startDate = startOfMonth(currentMonth);
      const endDate = endOfMonth(currentMonth);
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      
      // Simular scores para cada dia do mês
      days.forEach(day => {
        const baseScore = calculateHealthScore(client).score;
        // Adicionar variação aleatória para simular evolução
        const variation = (Math.random() - 0.5) * 20;
        const score = Math.max(0, Math.min(200, baseScore + variation));
        const category = getHealthCategory(score);
        
        scores.push({
          date: format(day, 'yyyy-MM-dd'),
          score: Math.round(score),
          category
        });
      });

      return {
        clientId: client.id,
        clientName: client.name,
        planner: client.planner,
        scores
      };
    });
  };

  // Calcular dados do calendário
  const calendarData = useMemo(() => {
    const startDate = startOfMonth(currentMonth);
    const endDate = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    
    return days.map(day => {
      const dayScores = heatmapData.flatMap(client => 
        client.scores.filter(score => score.date === format(day, 'yyyy-MM-dd'))
      );
      
      if (dayScores.length === 0) {
        return {
          date: day,
          score: null,
          category: null,
          clientCount: 0
        };
      }

      const avgScore = dayScores.reduce((sum, score) => sum + score.score, 0) / dayScores.length;
      const category = getHealthCategory(Math.round(avgScore));
      
      return {
        date: day,
        score: Math.round(avgScore),
        category,
        clientCount: dayScores.length
      };
    });
  }, [heatmapData, currentMonth]);

  // Detectar outliers
  const outliers = useMemo(() => {
    if (!showOutliers) return [];
    
    const allScores = heatmapData.flatMap(client => client.scores.map(s => s.score));
    if (allScores.length === 0) return [];
    
    const sorted = allScores.sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    
    return heatmapData.filter(client => 
      client.scores.some(score => score.score < lowerBound || score.score > upperBound)
    );
  }, [heatmapData, showOutliers]);

  useEffect(() => {
    setLoading(true);
    
    setTimeout(() => {
      const data = generateHeatmapData();
      setHeatmapData(data);
      setLoading(false);
    }, 500);
  }, [filteredClients, currentMonth]);

  const getScoreColor = (score: number | null, category: string | null) => {
    if (score === null) return isDarkMode ? 'bg-gray-800' : 'bg-gray-100';
    
    switch (category) {
      case 'Ótimo':
        return isDarkMode ? 'bg-green-900 hover:bg-green-800' : 'bg-green-100 hover:bg-green-200';
      case 'Estável':
        return isDarkMode ? 'bg-blue-900 hover:bg-blue-800' : 'bg-blue-100 hover:bg-blue-200';
      case 'Atenção':
        return isDarkMode ? 'bg-yellow-900 hover:bg-yellow-800' : 'bg-yellow-100 hover:bg-yellow-200';
      case 'Crítico':
        return isDarkMode ? 'bg-red-900 hover:bg-red-800' : 'bg-red-100 hover:bg-red-200';
      default:
        return isDarkMode ? 'bg-gray-800' : 'bg-gray-100';
    }
  };

  const getTextColor = (category: string | null) => {
    if (!category) return isDarkMode ? 'text-gray-500' : 'text-gray-400';
    
    switch (category) {
      case 'Ótimo':
        return isDarkMode ? 'text-green-300' : 'text-green-800';
      case 'Estável':
        return isDarkMode ? 'text-blue-300' : 'text-blue-800';
      case 'Atenção':
        return isDarkMode ? 'text-yellow-300' : 'text-yellow-800';
      case 'Crítico':
        return isDarkMode ? 'text-red-300' : 'text-red-800';
      default:
        return isDarkMode ? 'text-gray-500' : 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-gray-500">Carregando heatmap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Health Score Heatmap
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Visualização matricial da evolução dos Health Scores
            {selectedPlanner !== "all" && ` - ${selectedPlanner}`}
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowOutliers(!showOutliers)}
            className="flex items-center gap-2"
          >
            {showOutliers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {showOutliers ? 'Ocultar Outliers' : 'Mostrar Outliers'}
          </Button>
        </div>
      </div>

      {/* Controles do Calendário */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Calendário de Scores
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 mb-4">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarData.map((day, index) => (
              <div
                key={index}
                className={`aspect-square rounded-md flex flex-col items-center justify-center text-xs transition-colors ${getScoreColor(day.score, day.category)}`}
              >
                <div className={`font-semibold ${getTextColor(day.category)}`}>
                  {day.date.getDate()}
                </div>
                {day.score && (
                  <div className={`text-xs ${getTextColor(day.category)}`}>
                    {day.score}
                  </div>
                )}
                {day.clientCount > 0 && (
                  <div className="text-xs opacity-60">
                    {day.clientCount}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Heatmap de Clientes */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Heatmap por Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {heatmapData.map((client) => (
              <div key={client.clientId} className="flex items-center gap-4 p-2 rounded-lg hover:bg-background/50">
                <div className="w-32 text-sm font-medium truncate">
                  {client.clientName}
                </div>
                <div className="flex-1 flex gap-1">
                  {client.scores.map((score, index) => (
                    <div
                      key={index}
                      className={`w-3 h-6 rounded-sm transition-colors ${getScoreColor(score.score, score.category)}`}
                      title={`${format(new Date(score.date), 'dd/MM')}: ${score.score} (${score.category})`}
                    />
                  ))}
                </div>
                <div className="w-16 text-right text-sm">
                  {client.scores[client.scores.length - 1]?.score || 'N/A'}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Outliers */}
      {showOutliers && outliers.length > 0 && (
        <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Outliers Detectados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {outliers.map((client) => (
                <div key={client.clientId} className="flex items-center justify-between p-3 rounded-lg border bg-background/50">
                  <div>
                    <div className="font-medium">{client.clientName}</div>
                    <div className="text-sm text-muted-foreground">{client.planner}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      Score atual: {client.scores[client.scores.length - 1]?.score || 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {client.scores[client.scores.length - 1]?.category || 'N/A'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legenda */}
      <Card className={`${isDarkMode ? 'gradient-card-dark' : 'gradient-card-light'} ${isDarkMode ? 'card-hover-dark' : 'card-hover'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Thermometer className="h-5 w-5" />
            Legenda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${isDarkMode ? 'bg-green-900' : 'bg-green-100'}`}></div>
              <span className="text-sm">Ótimo (75-100)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${isDarkMode ? 'bg-blue-900' : 'bg-blue-100'}`}></div>
              <span className="text-sm">Estável (50-74)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${isDarkMode ? 'bg-yellow-900' : 'bg-yellow-100'}`}></div>
              <span className="text-sm">Atenção (30-49)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded ${isDarkMode ? 'bg-red-900' : 'bg-red-100'}`}></div>
              <span className="text-sm">Crítico (0-29)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HealthScoreHeatmap;
