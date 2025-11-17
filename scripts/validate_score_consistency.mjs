#!/usr/bin/env node

/**
 * Script de Validação de Consistência de Scores
 *
 * Compara os scores calculados no frontend (TypeScript) com os scores
 * salvos no histórico (calculados pelo SQL no backend).
 *
 * IMPORTANTE: Este script requer acesso ao Supabase via variáveis de ambiente.
 *
 * Uso:
 *   node scripts/validate_score_consistency.mjs [data_iso]
 *
 * Exemplo:
 *   node scripts/validate_score_consistency.mjs 2025-11-17
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carregar variáveis de ambiente
config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis SUPABASE_URL e SUPABASE_ANON_KEY não encontradas no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ========================================
// LÓGICA DE CÁLCULO DO FRONTEND (TypeScript convertido para JS)
// ========================================

function norm(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function calculateNPS(client, allClients) {
  let npsValue = client.nps_score_v3;

  // Se for cônjuge sem NPS próprio, herdar do pagante
  if (client.is_spouse && npsValue == null && client.spouse_partner_name) {
    const payerName = norm(client.spouse_partner_name);
    const payer = allClients.find(
      (c) =>
        norm(c.name) === payerName &&
        c.planner === client.planner &&
        !c.is_spouse
    );

    if (payer && payer.nps_score_v3 != null) {
      npsValue = payer.nps_score_v3;
    }
  }

  // Calcular pontos do pilar NPS
  if (npsValue != null) {
    if (npsValue >= 9) return 20; // Promotor
    if (npsValue >= 7) return 10; // Neutro
    return -10; // Detrator
  }

  // Sem NPS
  if (client.is_spouse) return 0; // Cônjuge sem NPS = 0 pontos
  return 10; // Não-cônjuge sem NPS = 10 pontos (neutro padrão)
}

function calculateReferral(client) {
  return client.has_nps_referral ? 10 : 0;
}

function calculatePayment(client) {
  const installments = client.overdue_installments ?? 0;
  const days = client.overdue_days ?? 0;

  if (installments === 0) return 40; // Adimplente

  if (installments === 1) {
    if (days <= 7) return 25;
    if (days <= 15) return 15;
    if (days <= 30) return 5;
    if (days <= 60) return 0;
    return -10; // 61+ dias
  }

  if (installments === 2) {
    if (days >= 30) return -20;
    return -10;
  }

  // 3+ parcelas = 0 (override total depois)
  return 0;
}

function calculateCrossSell(client) {
  const count = client.cross_sell_count ?? 0;
  if (count >= 3) return 15;
  if (count === 2) return 10;
  if (count === 1) return 5;
  return 0;
}

function calculateTenure(client) {
  const months = client.months_since_closing;
  if (months == null || months < 0) return 0;

  if (months >= 25) return 15; // Fidelizado
  if (months >= 13) return 15; // Maduro
  if (months >= 9) return 15; // Consolidado
  if (months >= 5) return 10; // Consolidação inicial
  return 5; // Onboarding (0-4 meses)
}

function calculateHealthScoreFrontend(client, allClients) {
  const nps = calculateNPS(client, allClients);
  const referral = calculateReferral(client);
  const payment = calculatePayment(client);
  const crossSell = calculateCrossSell(client);
  const tenure = calculateTenure(client);

  let total = nps + referral + payment + crossSell + tenure;

  // Override: 3+ parcelas em atraso = Score 0
  if ((client.overdue_installments ?? 0) >= 3) {
    total = 0;
  }

  // Garantir score mínimo de 0
  if (total < 0) {
    total = 0;
  }

  return {
    total,
    pillars: { nps, referral, payment, crossSell, tenure },
  };
}

// ========================================
// SCRIPT PRINCIPAL
// ========================================

async function validateConsistency(targetDate = null) {
  console.log('🔍 Validando Consistência de Scores Frontend vs Backend\n');

  // 1. Buscar clientes
  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('*');

  if (clientsError) {
    console.error('❌ Erro ao buscar clientes:', clientsError.message);
    process.exit(1);
  }

  if (!clients || clients.length === 0) {
    console.log('⚠️  Nenhum cliente encontrado no banco.');
    return;
  }

  console.log(`✅ ${clients.length} clientes carregados do banco\n`);

  // 2. Determinar data alvo
  const date = targetDate || new Date().toISOString().split('T')[0];
  console.log(`📅 Data alvo: ${date}\n`);

  // 3. Buscar histórico dessa data
  const { data: history, error: historyError } = await supabase
    .from('health_score_history')
    .select('*')
    .eq('recorded_date', date);

  if (historyError) {
    console.error('❌ Erro ao buscar histórico:', historyError.message);
    process.exit(1);
  }

  if (!history || history.length === 0) {
    console.log(`⚠️  Nenhum histórico encontrado para data ${date}`);
    console.log('💡 Dica: Execute uma importação para criar histórico dessa data.\n');
    return;
  }

  console.log(`✅ ${history.length} registros históricos encontrados para ${date}\n`);

  // 4. Comparar scores
  const divergences = [];
  let matchCount = 0;
  let notFoundInHistory = 0;

  for (const client of clients) {
    // Calcular score frontend
    const frontendScore = calculateHealthScoreFrontend(client, clients);

    // Buscar score do histórico
    const historyRecord = history.find((h) => h.client_id === client.id);

    if (!historyRecord) {
      notFoundInHistory++;
      continue;
    }

    // Comparar totais
    if (frontendScore.total !== historyRecord.health_score) {
      divergences.push({
        client_name: client.name,
        client_id: client.id,
        planner: client.planner,
        is_spouse: client.is_spouse,
        frontend_total: frontendScore.total,
        backend_total: historyRecord.health_score,
        difference: Math.abs(frontendScore.total - historyRecord.health_score),
        frontend_pillars: frontendScore.pillars,
        backend_pillars: {
          nps: historyRecord.nps_score_v3_pillar,
          referral: historyRecord.referral_pillar,
          payment: historyRecord.payment_pillar,
          crossSell: historyRecord.cross_sell_pillar,
          tenure: historyRecord.tenure_pillar,
        },
      });
    } else {
      matchCount++;
    }
  }

  // 5. Relatório
  console.log('═══════════════════════════════════════');
  console.log('📊 RELATÓRIO DE VALIDAÇÃO');
  console.log('═══════════════════════════════════════\n');

  console.log(`Total de clientes:              ${clients.length}`);
  console.log(`Registros no histórico:         ${history.length}`);
  console.log(`Clientes sem histórico:         ${notFoundInHistory}`);
  console.log(`✅ Scores consistentes:          ${matchCount}`);
  console.log(`❌ Divergências encontradas:     ${divergences.length}\n`);

  if (divergences.length === 0) {
    console.log('🎉 SUCESSO! Todos os scores calculados no frontend batem com o backend!\n');
    return;
  }

  // Mostrar divergências
  console.log('═══════════════════════════════════════');
  console.log('⚠️  DIVERGÊNCIAS ENCONTRADAS');
  console.log('═══════════════════════════════════════\n');

  const topDivergences = divergences.sort((a, b) => b.difference - a.difference).slice(0, 20);

  for (const div of topDivergences) {
    console.log(`Cliente: ${div.client_name} (${div.planner})${div.is_spouse ? ' [CÔNJUGE]' : ''}`);
    console.log(`  Frontend: ${div.frontend_total} | Backend: ${div.backend_total} | Diferença: ${div.difference}`);
    console.log(`  Pilares Frontend:`, div.frontend_pillars);
    console.log(`  Pilares Backend: `, div.backend_pillars);
    console.log('');
  }

  if (divergences.length > 20) {
    console.log(`... e mais ${divergences.length - 20} divergência(s)\n`);
  }

  console.log('═══════════════════════════════════════');
  console.log('💡 POSSÍVEIS CAUSAS DE DIVERGÊNCIAS:');
  console.log('═══════════════════════════════════════');
  console.log('1. Lógica de cálculo diferente entre frontend e backend');
  console.log('2. Herança de NPS para cônjuges não implementada no backend');
  console.log('3. Dados alterados após criação do histórico');
  console.log('4. Normalização de nomes diferente (acentos, espaços)');
  console.log('5. Valores NULL tratados de forma diferente\n');

  console.log('💡 PRÓXIMOS PASSOS:');
  console.log('1. Revisar as divergências acima');
  console.log('2. Comparar implementação em src/utils/healthScore.ts vs sql/record_health_score_history_v3_fixed.sql');
  console.log('3. Aplicar correções necessárias');
  console.log('4. Recriar histórico da data após correções\n');

  process.exit(divergences.length > 0 ? 1 : 0);
}

// Executar script
const targetDate = process.argv[2]; // Data opcional como argumento
validateConsistency(targetDate);
