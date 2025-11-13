/**
 * Script de Validação de Integridade - Health Score Dashboard
 * 
 * OBJETIVO: Validar consistência entre dados sem modificar nada
 * 
 * Este script verifica:
 * - Consistência entre scores calculados vs histórico
 * - Validação de ranges de dados (NPS, meses, etc.)
 * - Integridade de snapshots
 * 
 * USO: node scripts/validate_integrity.mjs
 * 
 * NOTA: Este script é READ-ONLY, não modifica dados
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

const supabase = createClient(supabaseUrl, supabaseKey);

// Função de cálculo v3 (copiada de healthScore.ts para validação)
function calculateHealthScoreV3(client) {
  // Override: 3+ parcelas = 0
  if (client.overdueInstallments !== undefined && client.overdueInstallments >= 3) {
    return { score: 0, category: 'Crítico' };
  }

  // NPS
  let nps = 10; // Default null
  if (client.npsScoreV3 !== null && client.npsScoreV3 !== undefined) {
    if (client.npsScoreV3 >= 9) nps = 20;
    else if (client.npsScoreV3 >= 7) nps = 10;
    else nps = -10;
  }

  // Referral
  const referral = client.hasNpsReferral ? 10 : 0;

  // Payment
  let payment = 40;
  const installments = client.overdueInstallments ?? 0;
  const days = client.overdueDays ?? 0;
  if (installments === 1) {
    if (days <= 7) payment = 25;
    else if (days <= 15) payment = 15;
    else if (days <= 30) payment = 5;
    else if (days <= 60) payment = 0;
    else payment = -10;
  } else if (installments === 2) {
    payment = days >= 30 ? -20 : -10;
  }

  // Cross Sell
  const crossSellCount = client.crossSellCount ?? 0;
  let crossSell = 0;
  if (crossSellCount >= 3) crossSell = 15;
  else if (crossSellCount === 2) crossSell = 10;
  else if (crossSellCount === 1) crossSell = 5;

  // Tenure
  let tenure = 0;
  const months = client.monthsSinceClosing;
  if (months !== null && months !== undefined && months >= 0) {
    if (months <= 4) tenure = 5;
    else if (months <= 8) tenure = 10;
    else if (months <= 12) tenure = 15;
    else if (months <= 24) tenure = 15;
    else tenure = 15;
  }

  let totalScore = nps + referral + payment + crossSell + tenure;
  if (totalScore < 0) totalScore = 0;

  let category = 'Crítico';
  if (totalScore >= 75) category = 'Ótimo';
  else if (totalScore >= 50) category = 'Estável';
  else if (totalScore >= 30) category = 'Atenção';

  return { score: totalScore, category };
}

async function validateIntegrity() {
  console.log('🔍 Iniciando validação de integridade...\n');

  const issues = [];
  const warnings = [];

  try {
    // 1. Buscar último snapshot
    const { data: lastDateRows, error: dateError } = await supabase
      .from('clients')
      .select('last_seen_at')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(1);

    if (dateError || !lastDateRows || !lastDateRows[0]) {
      issues.push('❌ Não foi possível encontrar último snapshot');
      console.log(issues[0]);
      return;
    }

    const lastSeenAt = lastDateRows[0].last_seen_at;
    console.log('📅 Último snapshot:', lastSeenAt);

    // 2. Buscar clientes do snapshot (amostra)
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('*')
      .eq('last_seen_at', lastSeenAt)
      .neq('name', '0')
      .neq('planner', '0')
      .limit(100); // Amostra para validação rápida

    if (clientsError) {
      issues.push(`❌ Erro ao buscar clientes: ${clientsError.message}`);
      console.log(issues[issues.length - 1]);
      return;
    }

    console.log(`👥 Validando ${clients.length} clientes (amostra)...\n`);

    // 3. Validar ranges de dados
    console.log('📊 Validando ranges de dados...');
    let invalidRanges = 0;
    clients.forEach(c => {
      // NPS deve estar entre 0-10 ou null
      if (c.nps_score_v3 !== null && (c.nps_score_v3 < 0 || c.nps_score_v3 > 10)) {
        invalidRanges++;
        warnings.push(`Cliente ${c.name}: NPS inválido (${c.nps_score_v3})`);
      }
      // Meses não deve ser negativo
      if (c.months_since_closing !== null && c.months_since_closing < 0) {
        invalidRanges++;
        warnings.push(`Cliente ${c.name}: Meses negativo (${c.months_since_closing})`);
      }
      // Parcelas em atraso não deve ser negativo
      if (c.overdue_installments < 0) {
        invalidRanges++;
        warnings.push(`Cliente ${c.name}: Parcelas em atraso negativo (${c.overdue_installments})`);
      }
      // Dias em atraso não deve ser negativo
      if (c.overdue_days < 0) {
        invalidRanges++;
        warnings.push(`Cliente ${c.name}: Dias em atraso negativo (${c.overdue_days})`);
      }
      // Cross sell não deve ser negativo
      if (c.cross_sell_count < 0) {
        invalidRanges++;
        warnings.push(`Cliente ${c.name}: Cross sell negativo (${c.cross_sell_count})`);
      }
    });

    if (invalidRanges > 0) {
      console.log(`⚠️  Encontrados ${invalidRanges} valores fora dos ranges esperados`);
      if (warnings.length <= 10) {
        warnings.forEach(w => console.log(`  ${w}`));
      } else {
        warnings.slice(0, 10).forEach(w => console.log(`  ${w}`));
        console.log(`  ... e mais ${warnings.length - 10} avisos`);
      }
    } else {
      console.log('✅ Todos os ranges de dados estão válidos');
    }

    // 4. Validar consistência de scores
    console.log('\n📊 Validando consistência de scores...');
    const snapshotDate = lastSeenAt.split('T')[0];
    const { data: history, error: historyError } = await supabase
      .from('health_score_history')
      .select('*')
      .eq('recorded_date', snapshotDate)
      .limit(100);

    if (!historyError && history && history.length > 0) {
      let inconsistencies = 0;
      const inconsistenciesList = [];

      clients.forEach(c => {
        const calculated = calculateHealthScoreV3({
          npsScoreV3: c.nps_score_v3,
          hasNpsReferral: c.has_nps_referral,
          overdueInstallments: c.overdue_installments,
          overdueDays: c.overdue_days,
          crossSellCount: c.cross_sell_count,
          monthsSinceClosing: c.months_since_closing
        });

        const hist = history.find(h => 
          h.client_id === c.id || 
          (h.client_name === c.name && h.planner === c.planner)
        );

        if (hist && Math.abs(calculated.score - hist.health_score) > 1) {
          inconsistencies++;
          inconsistenciesList.push({
            name: c.name,
            planner: c.planner,
            calculated: calculated.score,
            historical: hist.health_score,
            diff: calculated.score - hist.health_score
          });
        }
      });

      if (inconsistencies > 0) {
        console.log(`⚠️  Encontradas ${inconsistencies} inconsistências de score (>1 ponto de diferença)`);
        inconsistenciesList.slice(0, 5).forEach(inc => {
          console.log(`  ${inc.name} (${inc.planner}): Calculado=${inc.calculated}, Histórico=${inc.historical}, Diff=${inc.diff.toFixed(2)}`);
        });
        if (inconsistenciesList.length > 5) {
          console.log(`  ... e mais ${inconsistenciesList.length - 5} inconsistências`);
        }
      } else {
        console.log('✅ Scores calculados estão consistentes com histórico');
      }
    } else {
      console.log('⚠️  Não foi possível validar histórico (pode ser normal se não houver histórico ainda)');
    }

    // 5. Resumo
    console.log('\n📋 RESUMO DA VALIDAÇÃO:');
    console.log(`  ✅ Clientes validados: ${clients.length}`);
    console.log(`  ${invalidRanges > 0 ? '⚠️' : '✅'} Ranges inválidos: ${invalidRanges}`);
    console.log(`  ${warnings.length > 0 ? '⚠️' : '✅'} Avisos: ${warnings.length}`);

    if (issues.length === 0 && invalidRanges === 0) {
      console.log('\n✅ Validação concluída sem problemas críticos!');
    } else {
      console.log('\n⚠️  Validação concluída com avisos (verificar acima)');
    }

  } catch (error) {
    console.error('❌ Erro durante validação:', error);
    issues.push(`Erro: ${error.message}`);
  }
}

validateIntegrity();

