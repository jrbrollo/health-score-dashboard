export type Planner = 
  | "Barroso" 
  | "Rossetti" 
  | "Ton" 
  | "Bizelli" 
  | "Abraao" 
  | "Murilo" 
  | "Felipe" 
  | "Helio" 
  | "Vinícius";

export type LastMeeting = "< 30 dias" | "31-60 dias" | "> 60 dias";

export type AppUsage = 
  | "Acessou e categorizou (15 dias)"
  | "Acessou, sem categorização" 
  | "Sem acesso/categorização (30+ dias)";

export type PaymentStatus = 
  | "Pagamento em dia"
  | "1 parcela em atraso"
  | "2 parcelas em atraso"
  | "3+ parcelas em atraso";

export type NPSScore = "Promotor (9-10)" | "Neutro (7-8)" | "Detrator (0-6)";

export type EcosystemUsage = "Usou 2+ áreas" | "Usou 1 área" | "Não usou";

export type HealthCategory = "Ótimo" | "Estável" | "Atenção" | "Crítico";

export interface Client {
  id: string;
  name: string;
  planner: Planner;
  lastMeeting: LastMeeting;
  hasScheduledMeeting: boolean;
  appUsage: AppUsage;
  paymentStatus: PaymentStatus;
  hasReferrals: boolean;
  npsScore: NPSScore;
  ecosystemUsage: EcosystemUsage;
  createdAt: Date;
  updatedAt: Date;
}

export interface HealthScore {
  clientId: string;
  score: number;
  category: HealthCategory;
  breakdown: {
    meetingEngagement: number;
    appUsage: number;
    paymentStatus: number;
    ecosystemEngagement: number;
    npsScore: number;
  };
}