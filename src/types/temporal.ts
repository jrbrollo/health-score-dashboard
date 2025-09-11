import { Planner, HealthCategory } from "./client";

// Interface para histórico de Health Score
export interface HealthScoreHistory {
  id: string;
  clientId: string;
  recordedDate: Date;
  
  // Dados do cliente
  clientName: string;
  planner: Planner;
  
  // Health Score calculado
  healthScore: number;
  healthCategory: HealthCategory;
  
  // Breakdown detalhado
  breakdown: {
    meetingEngagement: number;
    appUsage: number;
    paymentStatus: number;
    ecosystemEngagement: number;
    npsScore: number;
  };
  
  // Dados originais para referência
  originalData: {
    lastMeeting: string;
    hasScheduledMeeting: boolean;
    appUsageStatus: string;
    paymentStatusDetail: string;
    hasReferrals: boolean;
    npsScoreDetail: string;
    ecosystemUsage: string;
  };
  
  createdAt: Date;
}

// Interface para análise temporal agregada
export interface TemporalAnalysis {
  recordedDate: Date;
  planner: Planner | "all";
  
  // Métricas gerais
  totalClients: number;
  avgHealthScore: number;
  
  // Contadores por categoria
  excellentCount: number;
  stableCount: number;
  warningCount: number;
  criticalCount: number;
  
  // Médias por pilar
  avgMeetingEngagement: number;
  avgAppUsage: number;
  avgPaymentStatus: number;
  avgEcosystemEngagement: number;
  avgNpsScore: number;
}

// Interface para dados de gráfico temporal
export interface TemporalChartData {
  date: string;
  avgScore: number;
  totalClients: number;
  excellent: number;
  stable: number;
  warning: number;
  critical: number;
  trend?: 'up' | 'down' | 'stable';
}

// Interface para análise de tendência
export interface TrendAnalysis {
  planner: Planner | "all";
  periodDays: number;
  
  // Métricas de tendência
  scoreChange: number; // Mudança no score médio
  scoreChangePercent: number;
  clientCountChange: number;
  
  // Tendência geral
  overallTrend: 'improving' | 'declining' | 'stable';
  
  // Principais mudanças
  improvements: {
    category: string;
    change: number;
  }[];
  
  concerns: {
    category: string;
    change: number;
  }[];
}

// Interface para comparação entre períodos
export interface PeriodComparison {
  currentPeriod: {
    startDate: Date;
    endDate: Date;
    avgScore: number;
    totalClients: number;
    distribution: Record<HealthCategory, number>;
  };
  
  previousPeriod: {
    startDate: Date;
    endDate: Date;
    avgScore: number;
    totalClients: number;
    distribution: Record<HealthCategory, number>;
  };
  
  changes: {
    scoreChange: number;
    scoreChangePercent: number;
    clientChange: number;
    distributionChanges: Record<HealthCategory, number>;
  };
}

// Tipos para filtros de análise temporal
export interface TemporalFilters {
  planners: (Planner | "all")[];
  dateRange: {
    startDate: Date;
    endDate: Date;
  };
  groupBy: 'day' | 'week' | 'month';
  metrics: ('score' | 'distribution' | 'pillars')[];
}

// Interface para configuração de gráficos
export interface ChartConfig {
  type: 'line' | 'area' | 'bar' | 'stacked';
  showTrend: boolean;
  showDistribution: boolean;
  showPillars: boolean;
  smoothing: boolean;
  animations: boolean;
}

export default {
  HealthScoreHistory,
  TemporalAnalysis,
  TemporalChartData,
  TrendAnalysis,
  PeriodComparison,
  TemporalFilters,
  ChartConfig
};
