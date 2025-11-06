import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkClientCount() {
  try {
    // 1. Obter a data do último snapshot
    const { data: lastDateRows, error: lastDateError } = await supabase
      .from('clients')
      .select('last_seen_at')
      .not('last_seen_at', 'is', null)
      .order('last_seen_at', { ascending: false })
      .limit(1);
    
    if (lastDateError) throw lastDateError;
    
    const lastSeenAt = lastDateRows && lastDateRows[0]?.last_seen_at;
    console.log('📅 Último snapshot:', lastSeenAt);

    // 2. Contar total de clientes no último snapshot
    const PAGE_SIZE = 1000;
    let offset = 0;
    let totalClients = 0;
    const allClients = [];

    while (true) {
      let query = supabase
        .from('clients')
        .select('id, name, planner, is_spouse, last_seen_at')
        .neq('name', '0')
        .neq('planner', '0')
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (lastSeenAt) {
        query = query.eq('last_seen_at', lastSeenAt);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('❌ Erro ao buscar clientes:', error);
        throw error;
      }

      if (data && data.length > 0) {
        allClients.push(...data);
        totalClients += data.length;
        console.log(`📦 Página ${Math.floor(offset / PAGE_SIZE) + 1}: ${data.length} clientes (total acumulado: ${totalClients})`);
      }

      if (!data || data.length < PAGE_SIZE) {
        console.log('✅ Fim da paginação');
        break;
      }

      offset += PAGE_SIZE;
    }

    console.log('\n📊 RESUMO:');
    console.log('Total de clientes no snapshot:', totalClients);
    
    const spouses = allClients.filter(c => c.is_spouse);
    const nonSpouses = allClients.filter(c => !c.is_spouse);
    
    console.log('Cônjuges (is_spouse=true):', spouses.length);
    console.log('Não-cônjuges (is_spouse=false):', nonSpouses.length);

    // 3. Verificar se há duplicatas por identity_key
    const { data: identityData, error: identityError } = await supabase
      .from('clients')
      .select('identity_key')
      .eq('last_seen_at', lastSeenAt);

    if (!identityError && identityData) {
      const identityKeys = identityData.map(c => c.identity_key);
      const uniqueKeys = new Set(identityKeys);
      console.log('\n🔑 Identity Keys:');
      console.log('Total de identity_keys:', identityKeys.length);
      console.log('Identity_keys únicos:', uniqueKeys.size);
      if (identityKeys.length !== uniqueKeys.size) {
        console.log('⚠️ Há duplicatas de identity_key!');
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

checkClientCount();

