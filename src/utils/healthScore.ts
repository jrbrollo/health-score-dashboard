import { Client, HealthScore, HealthCategory } from "@/types/client";

export function calculateHealthScore(client: Client): HealthScore {
  // Override rule: 3+ parcelas em atraso = Health Score = 0
  if (client.paymentStatus === "3+ parcelas em atraso") {
    return {
      clientId: client.id,
      score: 0,
      category: "Crítico",
      breakdown: {
        meetingEngagement: 0,
        appUsage: 0,
        paymentStatus: 0,
        ecosystemEngagement: 0,
        npsScore: 0,
      },
    };
  }

  // Calculate each pillar score
  const meetingEngagement = calculateMeetingEngagement(client);
  const appUsage = calculateAppUsage(client);
  const paymentStatus = calculatePaymentStatus(client);
  const ecosystemEngagement = calculateEcosystemEngagement(client);
  const npsScore = calculateNPSScore(client);

  const totalScore = meetingEngagement + appUsage + paymentStatus + ecosystemEngagement + npsScore;
  const category = getHealthCategory(totalScore);

  return {
    clientId: client.id,
    score: totalScore,
    category,
    breakdown: {
      meetingEngagement,
      appUsage,
      paymentStatus,
      ecosystemEngagement,
      npsScore,
    },
  };
}

function calculateMeetingEngagement(client: Client): number {
  let score = 0;
  
  // Última reunião (30% weight)
  switch (client.lastMeeting) {
    case "< 30 dias":
      score += 30;
      break;
    case "31-60 dias":
      score += 15;
      break;
    case "> 60 dias":
      score -= 10;
      break;
  }

  // Reunião futura agendada (30% weight)
  if (client.hasScheduledMeeting) {
    score += 10;
  }

  return score;
}

function calculateAppUsage(client: Client): number {
  // Uso do App de Finanças (20% weight)
  switch (client.appUsage) {
    case "Acessou e categorizou (15 dias)":
      return 30;
    case "Acessou, sem categorização":
      return 15;
    case "Sem acesso/categorização (30+ dias)":
      return -10;
    default:
      return 0;
  }
}

function calculatePaymentStatus(client: Client): number {
  // Pagamentos e Status Financeiro (20% weight)
  switch (client.paymentStatus) {
    case "Pagamento em dia":
      return 30;
    case "1 parcela em atraso":
      return -5;
    case "2 parcelas em atraso":
      return -15;
    case "3+ parcelas em atraso":
      return 0; // This case is handled by override rule
    default:
      return 0;
  }
}

function calculateEcosystemEngagement(client: Client): number {
  let score = 0;
  
  // Uso de outras áreas (15% weight)
  switch (client.ecosystemUsage) {
    case "Usou 2+ áreas":
      score += 10;
      break;
    case "Usou 1 área":
      score += 5;
      break;
    case "Não usou":
      score += 0;
      break;
  }

  // Indicações (15% weight)
  if (client.hasReferrals) {
    score += 5;
  }

  return score;
}

function calculateNPSScore(client: Client): number {
  // NPS (15% weight)
  switch (client.npsScore) {
    case "Promotor (9-10)":
      return 15;
    case "Neutro (7-8)":
      return 0;
    case "Detrator (0-6)":
      return -15;
    default:
      return 0;
  }
}

function getHealthCategory(score: number): HealthCategory {
  if (score >= 100) return "Ótimo";
  if (score >= 60) return "Estável";
  if (score >= 35) return "Atenção";
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