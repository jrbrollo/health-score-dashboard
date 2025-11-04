import { Client, HealthScore, HealthCategory } from "@/types/client";

/**
 * Calcula o Health Score v3 (escala 0-100)
 * Pilares: NPS (20) + Indicação (10) + Inadimplência (40) + Cross Sell (15) + Meses Relacionamento (15)
 */
export function calculateHealthScore(client: Client): HealthScore {
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
  const nps = calculateNPS(client);
  const referral = calculateReferral(client);
  const payment = calculatePayment(client);
  const crossSell = calculateCrossSell(client);
  const tenure = calculateTenure(client);

  let totalScore = nps + referral + payment + crossSell + tenure;
  
  // Garantir que não fica negativo
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
 * 1. NPS (20 pontos máx)
 */
function calculateNPS(client: Client): number {
  const npsValue = client.npsScoreV3;
  
  if (npsValue === null || npsValue === undefined) {
    // "Não Encontrou" = neutro (cliente novo < 6 meses ou cônjuge)
    return 10;
  }
  
  if (npsValue >= 9) {
    // Promotor (9-10)
    return 20;
  } else if (npsValue >= 7) {
    // Neutro (7-8)
    return 10;
  } else {
    // Detrator (0-6)
      return 0;
  }
}

/**
 * 2. Indicação NPS (10 pontos máx)
 */
function calculateReferral(client: Client): number {
  return client.hasNpsReferral ? 10 : 0;
}

/**
 * 3. Inadimplência (40 pontos máx) - RIGOROSO
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
    if (days <= 60) return -5;
    return -15; // 61+ dias
  }

  // 2 parcelas atrasadas - sempre penaliza
  if (installments === 2) {
    return -10;
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
 */
function calculateTenure(client: Client): number {
  const months = client.monthsSinceClosing;

  if (months === null || months === undefined || months < 0) {
      return 0;
  }

  if (months <= 3) return 5;   // Onboarding (0-3 meses)
  if (months <= 6) return 10;  // Consolidação inicial (4-6 meses)
  if (months <= 12) return 15; // Consolidado (7-12 meses)
  if (months <= 24) return 12; // Maduro (13-24 meses)
  return 15; // Fidelizado (25+ meses)
}

/**
 * Categorização v3 (escala 0-100)
 */
function getHealthCategory(score: number): HealthCategory {
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