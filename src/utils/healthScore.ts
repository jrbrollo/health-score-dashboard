import { Client, HealthScore, HealthCategory } from "@/types/client";

/**
 * Calcula o Health Score v3 (escala 0-100)
 * Pilares: NPS (-10 a 20) + Indicação (10) + Inadimplência (-20 a 40) + Cross Sell (15) + Meses Relacionamento (15)
 * Score mínimo: 0 (sem valores negativos)
 * 
 * @param client - Cliente para calcular o score
 * @param payerNpsMap - Mapa opcional de NPS do pagante (chave: "nome|planner", valor: nps ou null)
 */
export function calculateHealthScore(client: Client, payerNpsMap?: Map<string, number | null>): HealthScore {
  // Override rule: 3+ parcelas em atraso = Health Score = 0
  if (client.overdueInstallments !== undefined && client.overdueInstallments >= 3) {
    return {
      clientId: client.id,
      score: 0,
      category: "Crítico",
      breakdown: {
        nps: 0,
        referral: 0,
        payment: 0,
        crossSell: 0,
        tenure: 0,
      },
    };
  }

  // Calculate each pillar score (v3)
  const nps = calculateNPS(client, payerNpsMap);
  const referral = calculateReferral(client);
  const payment = calculatePayment(client);
  const crossSell = calculateCrossSell(client);
  const tenure = calculateTenure(client);

  let totalScore = nps + referral + payment + crossSell + tenure;
  
  // Garantir que não fica negativo (score mínimo = 0)
  if (totalScore < 0) {
    totalScore = 0;
  }

  const category = getHealthCategory(totalScore);

  return {
    clientId: client.id,
    score: totalScore,
    category,
    breakdown: {
      nps,
      referral,
      payment,
      crossSell,
      tenure,
    },
  };
}

/**
 * 1. NPS (-10 a 20 pontos)
 * NOVA LÓGICA:
 * - Detrator (0-6) = -10 pontos
 * - Neutro (7-8) = 10 pontos
 * - Promotor (9-10) = 20 pontos
 * - Null (não respondeu) = 10 pontos (neutro padrão para clientes não-cônjuges)
 * - Cônjuge sem NPS próprio nem do pagante = 0 pontos
 * 
 * HERANÇA DE NPS: Se cliente é cônjuge e não tem NPS próprio, herda do pagante
 */
function calculateNPS(client: Client, payerNpsMap?: Map<string, number | null>): number {
  let npsValue = client.npsScoreV3;
  
  // NOVA LÓGICA: Se for cônjuge e não tem NPS próprio, buscar do pagante
  if ((npsValue === null || npsValue === undefined) && client.isSpouse && client.spousePartnerName) {
    if (payerNpsMap) {
      // Buscar NPS do pagante no mapa (chave: nome normalizado + planner)
      const payerKey = `${client.spousePartnerName.toLowerCase().trim()}|${client.planner}`;
      const payerNps = payerNpsMap.get(payerKey);
      if (payerNps !== undefined) {
        npsValue = payerNps;
      }
    }
  }
  
  if (npsValue === null || npsValue === undefined) {
    // Se for cônjuge sem NPS (próprio nem do pagante) = 0 pontos
    if (client.isSpouse) {
      return 0;
    }
    // Cliente não-cônjuge sem NPS = 10 pontos (neutro)
    return 10;
  }
  
  if (npsValue >= 9) {
    // Promotor (9-10)
    return 20;
  } else if (npsValue >= 7) {
    // Neutro (7-8)
    return 10;
  } else {
    // Detrator (0-6) - MUDANÇA: era 0, agora -10
    return -10;
  }
}

/**
 * 2. Indicação NPS (10 pontos máx)
 */
function calculateReferral(client: Client): number {
  return client.hasNpsReferral ? 10 : 0;
}

/**
 * 3. Inadimplência (-20 a 40 pontos) - RIGOROSO
 * NOVA LÓGICA:
 * - 0 parcelas = 40 pontos
 * - 1 parcela: 0-7 dias (25), 8-15 dias (15), 16-30 dias (5), 31-60 dias (0), 61+ dias (-10)
 * - 2 parcelas: <30 dias (-10), ≥30 dias (-20)
 * - 3+ parcelas = override para score 0
 */
function calculatePayment(client: Client): number {
  const installments = client.overdueInstallments ?? 0;
  const days = client.overdueDays ?? 0;

  // Adimplente
  if (installments === 0) {
    return 40;
  }

  // 1 parcela atrasada - penalizar por dias
  if (installments === 1) {
    if (days <= 7) return 25;
    if (days <= 15) return 15;
    if (days <= 30) return 5;
    if (days <= 60) return 0;  // MUDANÇA: era -5, agora 0
    return -10; // 61+ dias - MUDANÇA: era -15, agora -10
  }

  // 2 parcelas atrasadas
  if (installments === 2) {
    // MUDANÇA: considera dias de atraso
    if (days >= 30) {
      return -20; // NOVO: 2 parcelas + 30+ dias
    }
    return -10; // 2 parcelas com menos de 30 dias
  }

  // 3+ parcelas já é tratado no override
  return 0;
}

/**
 * 4. Cross Sell (15 pontos máx)
 */
function calculateCrossSell(client: Client): number {
  const count = client.crossSellCount ?? 0;

  if (count === 0) return 0;
  if (count === 1) return 5;
  if (count === 2) return 10;
  return 15; // 3+ produtos
}

/**
 * 5. Meses de Fechamento / Tenure (15 pontos máx)
 * NOVA LÓGICA:
 * - 0-4 meses = 5 pontos (Onboarding)
 * - 5-8 meses = 10 pontos (Consolidação inicial)
 * - 9-12 meses = 15 pontos (Consolidado)
 * - 13-24 meses = 15 pontos (Maduro)
 * - 25+ meses = 15 pontos (Fidelizado)
 */
function calculateTenure(client: Client): number {
  const months = client.monthsSinceClosing;

  if (months === null || months === undefined || months < 0) {
      return 0;
  }

  if (months <= 4) return 5;   // MUDANÇA: era 0-3, agora 0-4
  if (months <= 8) return 10;  // MUDANÇA: era 4-6, agora 5-8
  if (months <= 12) return 15; // MUDANÇA: era 7-12, agora 9-12
  if (months <= 24) return 15; // MUDANÇA: era 12, agora 15
  return 15; // 25+ meses (mantém)
}

/**
 * Categorização v3 (escala 0-100)
 */
export function getHealthCategory(score: number): HealthCategory {
  if (score >= 75) return "Ótimo";
  if (score >= 50) return "Estável";
  if (score >= 30) return "Atenção";
  return "Crítico";
}

export function getHealthCategoryColor(category: HealthCategory): string {
  switch (category) {
    case "Ótimo":
      return "health-excellent";
    case "Estável":
      return "health-stable";
    case "Atenção":
      return "health-warning";
    case "Crítico":
      return "health-critical";
  }
}

/**
 * Cria um mapa de NPS do pagante para uso na herança de NPS para cônjuges
 * Chave: "nome normalizado|planner", Valor: nps_score_v3 ou null
 */
export function createPayerNpsMap(clients: Client[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  
  for (const client of clients) {
    // Apenas clientes não-cônjuges (pagantes) entram no mapa
    if (!client.isSpouse) {
      const key = `${client.name.toLowerCase().trim()}|${client.planner}`;
      map.set(key, client.npsScoreV3 ?? null);
    }
  }
  
  return map;
}