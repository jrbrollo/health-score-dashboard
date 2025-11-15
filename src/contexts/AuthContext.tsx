import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { UserProfile, HierarchyCascade } from '@/types/auth';
import { toast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, role: string, hierarchyName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  getHierarchyCascade: () => Promise<HierarchyCascade | null>;
  getAvailableNames: (role: string) => Promise<string[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Carregar perfil do usuário
  const loadUserProfile = async (userId: string): Promise<void> => {
    try {
      // Timeout aumentado para 15 segundos (pode demorar em conexões lentas)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout ao carregar perfil')), 15000);
      });

      const profilePromise = supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      const result = await Promise.race([profilePromise, timeoutPromise]);
      const { data, error } = result as any;

      if (error) {
        // Se for erro de "nenhuma linha", apenas definir perfil como null
        if (error.code === 'PGRST116') {
          console.warn('Perfil não encontrado para o usuário:', userId);
          setProfile(null);
          return;
        }
        throw error;
      }

      if (data) {
        setProfile({
          id: data.id,
          email: data.email,
          role: data.role,
          hierarchyName: data.hierarchy_name,
          createdAt: data.created_at ? new Date(data.created_at) : undefined,
          updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
        });
      } else {
        setProfile(null);
      }
    } catch (error: any) {
      console.error('Erro ao carregar perfil:', error);
      
      // Se for timeout, tentar novamente uma vez antes de desistir
      if (error.message?.includes('Timeout')) {
        console.warn('Timeout ao carregar perfil, tentando novamente...');
        try {
          // Tentar novamente sem timeout
          const { data, error: retryError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
          
          if (!retryError && data) {
            setProfile({
              id: data.id,
              email: data.email,
              role: data.role,
              hierarchyName: data.hierarchy_name,
              createdAt: data.created_at ? new Date(data.created_at) : undefined,
              updatedAt: data.updated_at ? new Date(data.updated_at) : undefined,
            });
            return;
          }
        } catch (retryErr) {
          console.error('Erro ao tentar novamente:', retryErr);
        }
      }
      
      // Em caso de erro, definir perfil como null mas não travar a aplicação
      setProfile(null);
    }
  };

  // Inicializar auth state
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    // Timeout de segurança: se demorar mais de 5 segundos, forçar loading = false
    timeoutId = setTimeout(() => {
      if (mounted) {
        console.warn('Timeout ao verificar sessão (5s), forçando loading = false');
        setLoading(false);
      }
    }, 5000);

    // Verificar sessão atual
    const checkSession = async () => {
      try {
        // Timeout de 3 segundos para getSession
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao obter sessão')), 3000);
        });

        const { data: { session }, error } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as any;
        
        if (!mounted) return;
        clearTimeout(timeoutId);
        
        if (error) {
          console.error('Erro ao verificar sessão:', error);
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Carregar perfil com timeout de 5 segundos
          const profileTimeoutPromise = new Promise<void>((resolve) => {
            setTimeout(() => {
              console.warn('Timeout ao carregar perfil (5s), continuando sem perfil');
              resolve();
            }, 5000);
          });

          Promise.race([
            loadUserProfile(session.user.id).catch(err => {
              console.error('Erro ao carregar perfil:', err);
            }),
            profileTimeoutPromise
          ]).finally(() => {
            if (mounted) setLoading(false);
          });
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao verificar sessão:', error);
        clearTimeout(timeoutId);
        if (mounted) setLoading(false);
      }
    };

    checkSession();

    // Ouvir mudanças de auth
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      clearTimeout(timeoutId);
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Carregar perfil sem bloquear a UI
        loadUserProfile(session.user.id).catch(err => {
          console.error('Erro ao carregar perfil no auth state change:', err);
        });
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Melhorar mensagens de erro
        if (error.message.includes('Invalid login credentials')) {
          throw new Error('Email ou senha incorretos. Verifique suas credenciais.');
        } else if (error.message.includes('Email not confirmed')) {
          throw new Error('Por favor, confirme seu email antes de fazer login. Verifique sua caixa de entrada.');
        }
        throw error;
      }

      if (data.user) {
        await loadUserProfile(data.user.id);
        toast({
          title: 'Login realizado!',
          description: 'Bem-vindo de volta!',
        });
      }
    } catch (error: any) {
      console.error('Erro ao fazer login:', error);
      toast({
        title: 'Erro no login',
        description: error.message || 'Não foi possível fazer login. Verifique suas credenciais.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const signUp = async (email: string, password: string, role: string, hierarchyName: string) => {
    try {
      // Validar nome na hierarquia
      const { data: isValid, error: validateError } = await supabase
        .rpc('validate_hierarchy_name', {
          p_role: role,
          p_hierarchy_name: hierarchyName,
        });

      if (validateError) throw validateError;

      if (!isValid) {
        throw new Error('O nome selecionado não existe na hierarquia. Por favor, verifique e tente novamente.');
      }

      // Criar usuário no Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        // Se o email já existe, sugerir fazer login
        if (authError.message?.includes('already registered') || authError.message?.includes('User already registered')) {
          throw new Error('Este email já está cadastrado. Por favor, faça login ou use a opção "Esqueci minha senha".');
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Falha ao criar usuário');
      }

      // Criar perfil usando função SQL (bypass RLS) - não precisa de sessão ativa
      const { error: profileError } = await supabase.rpc('create_user_profile', {
        p_user_id: authData.user.id,
        p_email: email,
        p_role: role,
        p_hierarchy_name: hierarchyName,
      });

      if (profileError) {
        console.error('Erro ao criar perfil:', profileError);
        
        // Se o erro for de email duplicado, verificar se o perfil já existe
        if (profileError.message?.includes('duplicate key') || profileError.message?.includes('unique constraint')) {
          // Verificar se o perfil existe para este usuário
          const { data: existingProfile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', authData.user.id)
            .maybeSingle();
          
          if (existingProfile) {
            // Perfil já existe, apenas fazer login
            console.log('Perfil já existe, fazendo login...');
          } else {
            // Email existe mas é de outro usuário
            throw new Error('Este email já está cadastrado. Por favor, faça login ou use outro email.');
          }
        } else {
          // Se der outro erro, tentar novamente após um delay
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { error: retryError } = await supabase.rpc('create_user_profile', {
            p_user_id: authData.user.id,
            p_email: email,
            p_role: role,
            p_hierarchy_name: hierarchyName,
          });
          if (retryError) {
            throw retryError;
          }
        }
      }

      // Aguardar um pouco para garantir que o perfil foi criado
      await new Promise(resolve => setTimeout(resolve, 500));

      // Verificar se temos sessão ativa
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        // Se não tiver sessão, é porque precisa confirmar o email primeiro
        // Mostrar mensagem de sucesso informando sobre a confirmação
        toast({
          title: 'Conta criada com sucesso!',
          description: 'Enviamos um e-mail de confirmação. Por favor, verifique sua caixa de entrada e clique no link para confirmar sua conta antes de fazer login.',
        });
        return; // Retornar sem erro, pois isso é esperado
      }

      // Se tiver sessão, carregar perfil e fazer login automático
      await loadUserProfile(authData.user.id);

      toast({
        title: 'Conta criada!',
        description: 'Sua conta foi criada com sucesso. Você já pode fazer login!',
      });
    } catch (error: any) {
      console.error('Erro ao criar conta:', error);
      toast({
        title: 'Erro ao criar conta',
        description: error.message || 'Não foi possível criar a conta. Tente novamente.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const signOut = async () => {
    try {
      // Tentar fazer signOut no Supabase, mas não bloquear se não houver sessão
      try {
        const { error } = await supabase.auth.signOut();
        // Se o erro for de sessão ausente, ignorar e continuar com limpeza local
        if (error && !error.message?.includes('session') && !error.message?.includes('Auth session missing')) {
          throw error;
        }
      } catch (signOutError: any) {
        // Se for erro de sessão ausente, apenas logar e continuar
        if (signOutError.message?.includes('session') || signOutError.message?.includes('Auth session missing')) {
          console.warn('Sessão já expirada ou ausente, limpando estado local');
        } else {
          throw signOutError;
        }
      }

      // Sempre limpar estado local, mesmo se signOut falhar
      setUser(null);
      setProfile(null);
      setSession(null);

      // Limpar localStorage do Supabase
      try {
        localStorage.removeItem('sb-pdlyaqxrkoqbqniercpi-auth-token');
        // Limpar outros possíveis itens de auth
        Object.keys(localStorage).forEach(key => {
          if (key.includes('supabase') || key.includes('auth')) {
            localStorage.removeItem(key);
          }
        });
      } catch (e) {
        console.warn('Erro ao limpar localStorage:', e);
      }

      // Redirecionar para login após logout
      window.location.href = '/login';
    } catch (error: any) {
      console.error('Erro ao fazer logout:', error);
      
      // Mesmo em caso de erro, limpar estado local e redirecionar
      setUser(null);
      setProfile(null);
      setSession(null);
      
      try {
        localStorage.clear();
      } catch (e) {
        // Ignorar erros ao limpar localStorage
      }
      
      window.location.href = '/login';
    }
  };

  const getHierarchyCascade = async (): Promise<HierarchyCascade | null> => {
    if (!profile) return null;

    try {
      const { data, error } = await supabase.rpc('get_hierarchy_cascade', {
        p_role: profile.role,
        p_hierarchy_name: profile.hierarchyName,
      });

      if (error) {
        console.error('Erro RPC get_hierarchy_cascade:', error);
        throw error;
      }

      // A função retorna uma única linha com arrays
      if (data && Array.isArray(data) && data.length > 0) {
        const result = data[0];
        return {
          plannerNames: Array.isArray(result.planner_names) ? result.planner_names : [],
          leaderNames: Array.isArray(result.leader_names) ? result.leader_names : [],
          mediatorNames: Array.isArray(result.mediator_names) ? result.mediator_names : [],
        };
      }

      // Se for manager, retornar objeto vazio (sem restrições)
      if (profile.role === 'manager') {
        return {
          plannerNames: [],
          leaderNames: [],
          mediatorNames: [],
        };
      }

      return null;
    } catch (error) {
      console.error('Erro ao buscar hierarquia cascata:', error);
      // Em caso de erro, retornar objeto vazio para manager, null para outros
      if (profile?.role === 'manager') {
        return {
          plannerNames: [],
          leaderNames: [],
          mediatorNames: [],
        };
      }
      return null;
    }
  };

  const getAvailableNames = async (role: string): Promise<string[]> => {
    try {
      console.log('🔍 Buscando nomes para role:', role);
      const { data, error } = await supabase.rpc('get_available_names_by_role', {
        p_role: role,
      });

      if (error) {
        console.error('❌ Erro na RPC get_available_names_by_role:', error);
        throw error;
      }

      console.log('✅ Dados retornados da RPC:', data);
      const names = (data || []).map((row: any) => {
        // A função SQL retorna { name: "..." }, mas pode retornar diretamente string em alguns casos
        return typeof row === 'string' ? row : (row?.name || row);
      });
      console.log('📋 Nomes processados:', names);
      return names;
    } catch (error) {
      console.error('Erro ao buscar nomes disponíveis:', error);
      return [];
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast({
        title: 'Email enviado!',
        description: 'Verifique sua caixa de entrada para redefinir sua senha.',
      });
    } catch (error: any) {
      console.error('Erro ao enviar email de reset:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível enviar o email de redefinição de senha.',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    getHierarchyCascade,
    getAvailableNames,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

