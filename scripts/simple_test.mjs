#!/usr/bin/env node

/**
 * Script Simples de Teste de Conexão
 */

const SUPABASE_URL = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

async function testSimple() {
  try {
    console.log('🔌 Testando conexão direta com Supabase REST API...\n');

    const url = `${SUPABASE_URL}/rest/v1/clients?limit=5`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'count=exact'
      }
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));

    if (response.ok) {
      const data = await response.json();
      const count = response.headers.get('content-range');

      console.log('\n✅ SUCESSO!');
      console.log(`Total de clientes (do header): ${count}`);
      console.log(`Clientes retornados: ${data.length}`);

      if (data.length > 0) {
        console.log('\nPrimeiro cliente:');
        console.log(JSON.stringify(data[0], null, 2));
      }
    } else {
      const error = await response.text();
      console.error('\n❌ ERRO:', error);
    }

  } catch (error) {
    console.error('❌ ERRO DE REDE:', error.message);
    console.error('Detalhes:', error);
  }
}

testSimple();
