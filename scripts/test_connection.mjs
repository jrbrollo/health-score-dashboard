#!/usr/bin/env node

/**
 * Script de Teste de Conexão com Supabase
 * Verifica conectividade e busca informações básicas do banco
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carrega variáveis de ambiente
config({ path: join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERRO: Variáveis de ambiente não encontradas');
  console.error('Certifique-se de que .env existe com SUPABASE_URL e SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔌 Testando conexão com Supabase...\n');
console.log(`📍 URL: ${supabaseUrl}`);
console.log(`🔑 Anon Key: ${supabaseKey.substring(0, 20)}...`);
console.log('');

async function testConnection() {
  try {
    // 1. Testar tabela clients
    console.log('📊 Testando acesso à tabela "clients"...');
    const { data: clients, error: clientsError, count } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: false })
      .limit(5);

    if (clientsError) {
      console.error('❌ Erro ao acessar tabela clients:', clientsError.message);
      if (clientsError.code === 'PGRST116') {
        console.log('ℹ️  Possível causa: RLS bloqueando acesso (precisa estar autenticado)');
      }
    } else {
      console.log(`✅ Tabela "clients" acessível`);
      console.log(`   Total de registros: ${count || 0}`);
      console.log(`   Primeiros 5 registros:`, clients?.length || 0);
      if (clients && clients.length > 0) {
        console.log(`   Exemplo de campos: ${Object.keys(clients[0]).join(', ')}`);
      }
    }
    console.log('');

    // 2. Testar tabela health_score_history
    console.log('📈 Testando acesso à tabela "health_score_history"...');
    const { data: history, error: historyError, count: historyCount } = await supabase
      .from('health_score_history')
      .select('*', { count: 'exact', head: false })
      .limit(5)
      .order('recorded_date', { ascending: false });

    if (historyError) {
      console.error('❌ Erro ao acessar tabela health_score_history:', historyError.message);
    } else {
      console.log(`✅ Tabela "health_score_history" acessível`);
      console.log(`   Total de registros históricos: ${historyCount || 0}`);
      console.log(`   Últimos 5 registros:`, history?.length || 0);
      if (history && history.length > 0) {
        console.log(`   Data mais recente: ${history[0].recorded_date}`);
        console.log(`   Exemplo de campos: ${Object.keys(history[0]).join(', ')}`);
      }
    }
    console.log('');

    // 3. Verificar data mínima do histórico
    console.log('📅 Verificando distribuição de datas no histórico...');
    const { data: dates, error: datesError } = await supabase
      .from('health_score_history')
      .select('recorded_date')
      .order('recorded_date', { ascending: true })
      .limit(1);

    if (!datesError && dates && dates.length > 0) {
      console.log(`   Data mais antiga: ${dates[0].recorded_date}`);

      // Verificar se há dados antes de 13/11/2025
      const { count: oldCount } = await supabase
        .from('health_score_history')
        .select('*', { count: 'exact', head: true })
        .lt('recorded_date', '2025-11-13');

      if (oldCount && oldCount > 0) {
        console.log(`   ⚠️  Atenção: ${oldCount} registros com data < 13/11/2025 (estrutura v2)`);
      } else {
        console.log(`   ✅ Todos os registros são >= 13/11/2025 (estrutura v3)`);
      }
    }
    console.log('');

    // 4. Verificar cônjuges
    console.log('👫 Verificando dados de cônjuges...');
    const { data: spouses, error: spousesError, count: spousesCount } = await supabase
      .from('clients')
      .select('name, spouse_partner_name, is_spouse', { count: 'exact', head: false })
      .eq('is_spouse', true)
      .limit(5);

    if (!spousesError) {
      console.log(`   Total de cônjuges: ${spousesCount || 0}`);
      if (spouses && spouses.length > 0) {
        console.log(`   Exemplos:`);
        spouses.forEach(s => {
          console.log(`     - ${s.name} (pagante: ${s.spouse_partner_name || 'N/A'})`);
        });
      }
    }
    console.log('');

    // 5. Resumo final
    console.log('═══════════════════════════════════════');
    console.log('✅ CONEXÃO ESTABELECIDA COM SUCESSO!');
    console.log('═══════════════════════════════════════');
    console.log('Próximos passos disponíveis:');
    console.log('  1. Validar integridade dos dados');
    console.log('  2. Corrigir herança de NPS');
    console.log('  3. Implementar testes automáticos');
    console.log('  4. Investigar redução de clientes 13→14/11');
    console.log('');

  } catch (error) {
    console.error('❌ ERRO INESPERADO:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testConnection();
