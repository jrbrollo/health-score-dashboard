import { Client } from "@/types/client";

const INVALID_TOKENS = new Set<string>([
  "#n/d", "n/d", "na", "n/a", "0", "-", "—", "", "#ref!"
]);

export function isInvalid(value?: string | null): boolean {
  if (value == null) return true;
  const v = value.trim().toLowerCase();
  return INVALID_TOKENS.has(v);
}

/**
 * Normaliza texto removendo diacríticos, convertendo para lowercase e trim
 * Retorna null se o valor for inválido
 */
export function normalizeText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isInvalid(trimmed)) return null;
  
  // Normalizar: remover diacríticos, lowercase, trim
  return trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeOrNull(value?: string | null): string | null {
  return isInvalid(value) ? null : value as string;
}

export function buildUniqueList(clients: Client[], field: keyof Client): string[] {
  const set = new Set<string>();
  for (const c of clients) {
    const v = (c[field] as unknown as string) || null;
    const n = normalizeOrNull(v);
    if (n) set.add(n);
  }
  return Array.from(set);
}

export interface HierarchyFilters {
  selectedPlanner?: string | null;
  managers?: string[];
  mediators?: string[];
  leaders?: string[];
}

export function applyHierarchyFilters(
  clients: Client[],
  filters: HierarchyFilters
): Client[] {
  // Normalizar valores dos filtros para comparação consistente
  const planners = filters.selectedPlanner ? [normalizeText(filters.selectedPlanner) || filters.selectedPlanner] : [];
  const managers = (filters.managers ?? []).map(m => normalizeText(m) || m).filter(Boolean);
  const mediators = (filters.mediators ?? []).map(m => normalizeText(m) || m).filter(Boolean);
  const leaders = (filters.leaders ?? []).map(l => normalizeText(l) || l).filter(Boolean);

  // Debug: log dos filtros aplicados
  if (mediators.length > 0 || leaders.length > 0 || managers.length > 0) {
    console.log('🔍 Aplicando filtros de hierarquia:', {
      planners,
      managers,
      mediators,
      leaders,
      totalClients: clients.length
    });
  }

  const filtered = clients.filter(c => {
    if (!c.name || isInvalid(c.name)) return false;

    // Planejador: só filtra quando um planner específico foi escolhido
    if (planners.length > 0 && planners[0]) {
      const clientPlannerNorm = normalizeText(c.planner);
      if (!clientPlannerNorm || clientPlannerNorm !== planners[0]) return false;
    }

    if (managers.length > 0) {
      const val = normalizeText(c.manager);
      if (!val || !managers.some(m => {
        const normalizedFilter = normalizeText(m);
        // Comparação flexível: verifica se o valor do cliente começa com o filtro OU se o filtro começa com o valor
        // Isso permite que "Matheus Okamura" corresponda a "Matheus Okamura Lopes"
        return normalizedFilter === val || val.startsWith(normalizedFilter) || normalizedFilter.startsWith(val);
      })) return false;
    }
    if (mediators.length > 0) {
      const val = normalizeText(c.mediator);
      if (!val || !mediators.some(m => {
        const normalizedFilter = normalizeText(m);
        // Comparação flexível: verifica se o valor do cliente começa com o filtro OU se o filtro começa com o valor
        // Isso permite que "Matheus Okamura" corresponda a "Matheus Okamura Lopes"
        return normalizedFilter === val || val.startsWith(normalizedFilter) || normalizedFilter.startsWith(val);
      })) return false;
    }
    if (leaders.length > 0) {
      const val = normalizeText(c.leader);
      if (!val || !leaders.some(l => {
        const normalizedFilter = normalizeText(l);
        // Comparação flexível: verifica se o valor do cliente começa com o filtro OU se o filtro começa com o valor
        // Isso permite que "Matheus Okamura" corresponda a "Matheus Okamura Lopes"
        return normalizedFilter === val || val.startsWith(normalizedFilter) || normalizedFilter.startsWith(val);
      })) return false;
    }
    return true;
  });

  // Debug: log do resultado
  if (mediators.length > 0 || leaders.length > 0 || managers.length > 0) {
    // Encontrar alguns exemplos de clientes que não passaram no filtro para debug
    const exemploRejeitado = clients.find(c => {
      if (!c.name || isInvalid(c.name)) return false;
      if (mediators.length > 0) {
        const val = normalizeText(c.mediator);
        const normalizedFilter = normalizeText(mediators[0]);
        return val && normalizedFilter && val !== normalizedFilter && !val.startsWith(normalizedFilter) && !normalizedFilter.startsWith(val);
      }
      return false;
    });
    
    console.log('✅ Filtros aplicados:', {
      filtrados: filtered.length,
      total: clients.length,
      exemploMediator: mediators[0],
      exemploClientMediator: filtered[0]?.mediator,
      exemploRejeitado: exemploRejeitado ? {
        mediator: exemploRejeitado.mediator,
        normalized: normalizeText(exemploRejeitado.mediator),
        filterNormalized: normalizeText(mediators[0])
      } : null
    });
  }

  return filtered;
}

export function uniqueById(clients: Client[]): Client[] {
  const seen = new Set<string>();
  const out: Client[] = [];
  for (const c of clients) {
    if (!c.id) continue;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}



