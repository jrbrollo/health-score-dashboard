const SUPABASE_URL = 'https://pdlyaqxrkoqbqniercpi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkbHlhcXhya29xYnFuaWVyY3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1MTIwMTQsImV4cCI6MjA3MzA4ODAxNH0.iOhMYwCMlRnYvNfg6EJqE0imk4Gn7kvK2PwdqlXu70E';

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function main() {
  const rows = await fetchJson(
    `${SUPABASE_URL}/rest/v1/health_score_history?select=client_id,client_name,planner,health_score,recorded_date&order=recorded_date.desc&limit=20`
  );
  console.log(rows.map(r => ({
    recorded_date: r.recorded_date,
    planner: r.planner,
    client_name: r.client_name,
    score: r.health_score,
  })));
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});


