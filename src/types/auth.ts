export type UserRole = 'manager' | 'mediator' | 'leader' | 'planner';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  hierarchyName: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AuthUser {
  id: string;
  email: string;
  profile: UserProfile | null;
}

export interface HierarchyCascade {
  plannerNames: string[];
  leaderNames: string[];
  mediatorNames: string[];
}

