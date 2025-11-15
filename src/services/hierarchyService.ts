import { supabase } from '@/integrations/supabase/client';

export interface HierarchyNames {
  managers: string[];
  mediators: string[];
  leaders: string[];
  planners: string[];
}

/**
 * Busca os nomes da hierarquia da tabela hierarchy_roles
 */
export async function getHierarchyNames(): Promise<HierarchyNames> {
  try {
    // Buscar managers, mediators e leaders da tabela hierarchy_roles
    const [managersResult, mediatorsResult, leadersResult, plannersResult] = await Promise.all([
      supabase.rpc('get_managers_for_filters'),
      supabase.rpc('get_mediators_for_filters'),
      supabase.rpc('get_leaders_for_filters'),
      supabase.rpc('get_available_names_by_role', { p_role: 'planner' }),
    ]);

    return {
      managers: (managersResult.data || []).map((row: any) => row.name || row),
      mediators: (mediatorsResult.data || []).map((row: any) => row.name || row),
      leaders: (leadersResult.data || []).map((row: any) => row.name || row),
      planners: (plannersResult.data || []).map((row: any) => row.name || row),
    };
  } catch (error) {
    console.error('Erro ao buscar nomes da hierarquia:', error);
    return {
      managers: [],
      mediators: [],
      leaders: [],
      planners: [],
    };
  }
}

