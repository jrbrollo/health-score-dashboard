// Planejadores e hierarquia comercial
export type Planner = string; // Agora dinâmico, pois há muitos planejadores

export type HealthCategory = "Ótimo" | "Estável" | "Atenção" | "Crítico";

// ============================================
// CLIENT V3 - Nova estrutura
// ============================================
export interface Client {
  id: string;
  name: string;
  
  // Contato
  email?: string;
  phone?: string;
  
  // Hierarquia comercial
  planner: string;
  leader?: string;      // Líder em Formação
  mediator?: string;    // Mediador
  manager?: string;     // Gerente
  
  // Flags
  isSpouse?: boolean;   // Cônjuge (marcado explicitamente nas análises)
  
  // Métricas v3
  monthsSinceClosing?: number | null;  // Meses desde fechamento
  npsScoreV3?: number | null;          // 0-10 ou null para "Não Encontrou"
  hasNpsReferral?: boolean;            // Indicação NPS
  overdueInstallments?: number;        // Parcelas em atraso (0 = adimplente)
  overdueDays?: number;                // Dias de inadimplência
  crossSellCount?: number;             // Produtos cross sell
  
  // Campos de reunião (v2 - deprecated, manter para compatibilidade)
  lastMeeting?: string;
  hasScheduledMeeting?: boolean;
  appUsage?: string;
  paymentStatus?: string;
  hasReferrals?: boolean;
  npsScore?: string;
  ecosystemUsage?: string;
  
  // Reuniões v3 (preparado para versão futura)
  lastMeetingV3?: string;
  hasScheduledMeetingV3?: boolean;
  meetingsEnabled?: boolean;
  // Atividade
  isActive?: boolean;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface BulkImportPayload {
  clients: Omit<Client, "id" | "createdAt" | "updatedAt">[];
  sheetDate?: string;
  sheetDateRaw?: string;
}

// ============================================
// HEALTH SCORE V3 - Nova estrutura de breakdown
// ============================================
export interface HealthScore {
  clientId: string;
  score: number;        // 0-100 (v3)
  category: HealthCategory;
  breakdown: {
    nps: number;        // 20 pts máx
    referral: number;   // 10 pts máx
    payment: number;    // 40 pts máx
    crossSell: number;  // 15 pts máx
    tenure: number;     // 15 pts máx
  };
}

// ============================================
// TYPES LEGADOS (v2) - Manter para compatibilidade
// ============================================
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