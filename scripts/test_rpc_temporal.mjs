const SUPABASE_URL = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

async function main() {
  const payload = {
    start_date: '2025-10-20',
    end_date: '2025-11-05',
    planner_filter: 'all',
    managers: null,
    mediators: null,
    leaders: null,
    include_null_manager: false,
    include_null_mediator: false,
    include_null_leader: false,
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_temporal_analysis_asof`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  console.log('status:', res.status);
  const text = await res.text();
  console.log('body:', text);
}

main().catch((err) => {
  console.error('Erro na chamada RPC:', err);
  process.exit(1);
});


