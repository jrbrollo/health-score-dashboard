import { Client } from "@/types/client";

const INVALID_TOKENS = new Set<string>([
  "#n/d", "n/d", "na", "n/a", "0", "-", "—", "", "#ref!"
]);

export function isInvalid(value?: string | null): boolean {
  if (value == null) return true;
  const v = value.trim().toLowerCase();
  return INVALID_TOKENS.has(v);
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
  const planners = filters.selectedPlanner ? [filters.selectedPlanner] : [];
  const managers = filters.managers ?? [];
  const mediators = filters.mediators ?? [];
  const leaders = filters.leaders ?? [];

  return clients.filter(c => {
    if (!c.name || isInvalid(c.name)) return false;

    // Planejador: só filtra quando um planner específico foi escolhido
    if (planners.length > 0) {
      if (normalizeOrNull(c.planner) !== planners[0]) return false;
    }

    if (managers.length > 0) {
      const val = normalizeOrNull(c.manager);
      if (!val || !managers.includes(val)) return false;
    }
    if (mediators.length > 0) {
      const val = normalizeOrNull(c.mediator);
      if (!val || !mediators.includes(val)) return false;
    }
    if (leaders.length > 0) {
      const val = normalizeOrNull(c.leader);
      if (!val || !leaders.includes(val)) return false;
    }
    return true;
  });
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



