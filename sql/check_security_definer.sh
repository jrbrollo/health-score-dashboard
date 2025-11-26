#!/bin/bash

# Lista de funções RPC usadas pelo frontend
functions=(
  "backfill_health_score_history"
  "bulk_insert_clients_v3"
  "create_user_profile"
  "diff_snapshot_pairs"
  "get_available_names_by_role"
  "get_client_health_score_evolution"
  "get_current_score"
  "get_hierarchy_cascade"
  "get_leaders_for_filters"
  "get_managers_for_filters"
  "get_mediators_for_filters"
  "get_sankey_movement"
  "get_temporal_analysis_asof"
  "get_temporal_series"
  "validate_hierarchy_name"
)

echo "Verificando funções RPC..."
echo ""

for func in "${functions[@]}"; do
  echo "=== $func ==="

  # Procurar definição da função
  result=$(grep -r "CREATE.*FUNCTION.*$func" /home/user/health-score-dashboard/sql/*.sql 2>/dev/null | head -1)

  if [ -z "$result" ]; then
    echo "⚠️  FUNÇÃO NÃO ENCONTRADA"
  else
    file=$(echo "$result" | cut -d: -f1)
    echo "📁 Arquivo: $file"

    # Verificar se tem SECURITY DEFINER
    if grep -A 100 "CREATE.*FUNCTION.*$func" "$file" 2>/dev/null | grep -q "SECURITY DEFINER"; then
      echo "✅ HAS SECURITY DEFINER"
    else
      echo "❌ MISSING SECURITY DEFINER"
    fi
  fi
  echo ""
done
