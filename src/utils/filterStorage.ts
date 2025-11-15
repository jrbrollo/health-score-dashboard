/**
 * Utilitários para salvar e carregar filtros
 */

export interface SavedFilters {
  planner?: string;
  manager?: string;
  mediator?: string;
  leader?: string;
  category?: string;
  searchTerm?: string;
  name: string;
  createdAt: string;
}

const STORAGE_KEY = 'healthScoreSavedFilters';

/**
 * Salva filtros no localStorage
 */
export function saveFilters(filters: Omit<SavedFilters, 'createdAt'>, name: string): void {
  const savedFilters = getSavedFilters();
  const newFilter: SavedFilters = {
    ...filters,
    name,
    createdAt: new Date().toISOString()
  };

  // Verificar se já existe filtro com mesmo nome
  const existingIndex = savedFilters.findIndex(f => f.name === name);
  if (existingIndex >= 0) {
    savedFilters[existingIndex] = newFilter;
  } else {
    savedFilters.push(newFilter);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedFilters));
}

/**
 * Carrega filtros salvos do localStorage
 */
export function getSavedFilters(): SavedFilters[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (error) {
    console.error('Erro ao carregar filtros salvos:', error);
    return [];
  }
}

/**
 * Deleta filtro salvo
 */
export function deleteSavedFilter(name: string): void {
  const savedFilters = getSavedFilters();
  const filtered = savedFilters.filter(f => f.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

/**
 * Aplica filtros salvos
 */
export function applySavedFilters(name: string): SavedFilters | null {
  const savedFilters = getSavedFilters();
  const filter = savedFilters.find(f => f.name === name);
  return filter || null;
}

