import { UserProfile, HierarchyCascade } from '@/types/auth';
import { HierarchyFilters } from './filters';

/**
 * Aplica filtros automáticos baseado no role do usuário
 */
export async function getAuthFilters(
  profile: UserProfile | null,
  getHierarchyCascade: () => Promise<HierarchyCascade | null>
): Promise<HierarchyFilters> {
  if (!profile) {
    // Sem autenticação = sem acesso
    return {
      selectedPlanner: null,
      managers: [],
      mediators: [],
      leaders: [],
    };
  }

  switch (profile.role) {
    case 'manager':
      // Gerente vê tudo (sem filtros)
      return {
        selectedPlanner: null,
        managers: [],
        mediators: [],
        leaders: [],
      };

    case 'mediator':
      // Mediador vê sua estrutura + cascata abaixo
      const mediatorCascade = await getHierarchyCascade();
      // Sempre incluir o próprio nome do mediador, mesmo se cascade retornar vazio
      const mediatorNames = mediatorCascade?.mediatorNames || [];
      // Garantir que o próprio nome está incluído (normalizado para comparação)
      const normalizedOwnName = profile.hierarchyName.toLowerCase().trim();
      const hasOwnName = mediatorNames.some(name => 
        name.toLowerCase().trim() === normalizedOwnName
      );
      if (!hasOwnName) {
        mediatorNames.push(profile.hierarchyName);
      }
      console.log('🔐 Mediador - Cascade:', {
        cascade: mediatorCascade,
        mediatorNames,
        ownName: profile.hierarchyName
      });
      return {
        selectedPlanner: null,
        managers: [],
        mediators: mediatorNames,
        leaders: mediatorCascade?.leaderNames || [],
      };

    case 'leader':
      // Líder vê sua estrutura + planejadores abaixo
      const leaderCascade = await getHierarchyCascade();
      return {
        selectedPlanner: null,
        managers: [],
        mediators: [],
        leaders: leaderCascade?.leaderNames || [profile.hierarchyName],
      };

    case 'planner':
      // Planejador vê apenas seus clientes
      return {
        selectedPlanner: profile.hierarchyName,
        managers: [],
        mediators: [],
        leaders: [],
      };

    default:
      return {
        selectedPlanner: null,
        managers: [],
        mediators: [],
        leaders: [],
      };
  }
}

