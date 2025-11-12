import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Client, Planner, BulkImportPayload } from "@/types/client";
import { Dashboard } from "@/components/Dashboard";
import { ClientManager } from "@/components/ClientManager";
import { clientService } from "@/services/clientService";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { getAuthFilters } from "@/lib/authFilters";
import { HierarchyFilters } from "@/lib/filters";
import { Button } from "@/components/ui/button";

const Index = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, getHierarchyCascade, signOut } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showClientManager, setShowClientManager] = useState(false);
  const [selectedPlanner, setSelectedPlanner] = useState<Planner | "all">("all");
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authFilters, setAuthFilters] = useState<HierarchyFilters | null>(null);

  // Verificar autenticação
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  // Carregar filtros de autenticação
  useEffect(() => {
    if (profile) {
      getAuthFilters(profile, getHierarchyCascade).then(filters => {
        setAuthFilters(filters);
      }).catch(error => {
        console.error('Erro ao carregar filtros de autenticação:', error);
        // Em caso de erro, definir filtros vazios para não travar a aplicação
        setAuthFilters({
          selectedPlanner: null,
          managers: [],
          mediators: [],
          leaders: [],
        });
      });
    } else if (!authLoading && user) {
      // Se não tem perfil mas tem usuário, definir filtros vazios
      setAuthFilters({
        selectedPlanner: null,
        managers: [],
        mediators: [],
        leaders: [],
      });
    }
  }, [profile, getHierarchyCascade, authLoading, user]);

  // Carregar clientes do Supabase ao inicializar
  useEffect(() => {
    if (user && authFilters !== null && profile) {
      loadClients();
    }
  }, [user, authFilters, profile]);

  // Aplicar modo escuro ao documento
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const loadClients = async () => {
    try {
      setLoading(true);
      let clientsData = await clientService.getAllClients();
      
      // Aplicar filtros de autenticação
      if (authFilters) {
        const { applyHierarchyFilters } = await import('@/lib/filters');
        clientsData = applyHierarchyFilters(clientsData, authFilters);
      }
      // Debug: distribuição de Cross Sell para diagnóstico
      try {
        const dist = clientsData.reduce((acc: any, c) => {
          const v = c.crossSellCount ?? 0;
          if (v >= 3) acc['3+'] = (acc['3+'] || 0) + 1; else acc[String(v)] = (acc[String(v)] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log('📊 Distribuição crossSellCount:', dist);
        const referrals = clientsData.reduce((acc, c) => {
          const key = c.hasNpsReferral ? 'com_indicacao' : 'sem_indicacao';
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        console.log('📊 Distribuição hasNpsReferral:', referrals);
      } catch (e) {
        console.warn('Warn ao calcular distribuição de crossSellCount:', e);
      }
      setClients(clientsData);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os clientes. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddClient = async (clientData: Omit<Client, "id" | "createdAt" | "updatedAt">) => {
    try {
      const newClient = await clientService.createClient(clientData);
      if (newClient) {
        setClients(prev => [...prev, newClient]);
        setShowForm(false);
        toast({
          title: "Cliente adicionado!",
          description: `${clientData.name} foi cadastrado com sucesso.`,
        });
      } else {
        throw new Error('Falha ao criar cliente');
      }
    } catch (error) {
      console.error('Erro ao adicionar cliente:', error);
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o cliente. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleCancelForm = () => {
    setShowForm(false);
  };

  const handleBulkImport = async ({ clients: importedClients, sheetDate }: BulkImportPayload) => {
    try {
      console.log('📤 Iniciando importação de', importedClients.length, 'clientes', sheetDate ? `para a data ${sheetDate}` : '');
      const newClients = await clientService.createMultipleClients(importedClients, { sheetDate });
      if (newClients.length > 0) {
        // Após import/upsert, recarregar do banco para garantir dados atualizados (evita manter versões antigas no estado)
        await loadClients();
        toast({
          title: "Importação concluída!",
          description: `${newClients.length} clientes foram importados/atualizados com sucesso.`,
        });
      } else {
        throw new Error('Nenhum cliente foi importado');
      }
    } catch (error: any) {
      console.error('❌ Erro ao importar clientes:', error);
      const errorMessage = error?.message || 'Erro desconhecido';
      const errorDetails = error?.details || error?.hint || '';
      toast({
        title: "Erro na importação",
        description: `${errorMessage}${errorDetails ? ` - ${errorDetails}` : ''}`,
        variant: "destructive",
      });
    }
  };

  const handleUpdateClient = async (clientId: string, updatedData: Partial<Client>) => {
    try {
      const updatedClient = await clientService.updateClient(clientId, updatedData);
      if (updatedClient) {
        setClients(prev => prev.map(client => 
          client.id === clientId ? updatedClient : client
        ));
        toast({
          title: "Cliente atualizado!",
          description: "As informações foram salvas com sucesso.",
        });
      } else {
        throw new Error('Falha ao atualizar cliente');
      }
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o cliente. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    try {
      const success = await clientService.deleteClient(clientId);
      if (success) {
        setClients(prev => prev.filter(client => client.id !== clientId));
        toast({
          title: "Cliente excluído!",
          description: "O cliente foi removido da carteira.",
        });
      } else {
        throw new Error('Falha ao excluir cliente');
      }
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      toast({
        title: "Erro",
        description: "Não foi possível excluir o cliente. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleManageClients = (planner?: Planner | "all") => {
    if (planner) {
      setSelectedPlanner(planner);
    }
    setShowClientManager(true);
  };

  const handleBackToDashboard = () => {
    setShowClientManager(false);
  };

  // Se usuário está autenticado mas não tem perfil, redirecionar para login
  useEffect(() => {
    if (!authLoading && user && !profile && authFilters === null) {
      // Aguardar um pouco para ver se o perfil carrega
      const timer = setTimeout(() => {
        if (!profile) {
          toast({
            title: 'Perfil não encontrado',
            description: 'Sua conta não possui perfil. Por favor, entre em contato com o administrador.',
            variant: 'destructive',
          });
          signOut();
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [user, profile, authLoading, authFilters]);

  // Tela de loading (auth ou dados)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold">Verificando autenticação...</h2>
          <p className="text-muted-foreground mb-4">Aguarde enquanto verificamos sua sessão</p>
          <Button
            variant="outline"
            onClick={() => {
              // Limpar localStorage e recarregar
              try {
                localStorage.clear();
                window.location.href = '/login';
              } catch (e) {
                window.location.reload();
              }
            }}
            className="mt-4"
          >
            Limpar dados e voltar ao login
          </Button>
        </div>
      </div>
    );
  }

  // Se não tem perfil após loading de auth, aguardar um pouco antes de mostrar erro
  if (user && !profile && authFilters === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold">Carregando perfil...</h2>
          <p className="text-muted-foreground">Carregando informações do usuário</p>
        </div>
      </div>
    );
  }

  // Aguardar um pouco antes de mostrar erro de perfil (pode ser apenas lentidão)
  useEffect(() => {
    if (!authLoading && user && !profile) {
      const timer = setTimeout(() => {
        setShowProfileError(true);
      }, 5000); // Aguardar 5 segundos antes de mostrar erro
      return () => clearTimeout(timer);
    } else {
      setShowProfileError(false);
    }
  }, [authLoading, user, profile]);

  // Se não tem perfil após loading, mostrar erro (mas aguardar um pouco para evitar falsos positivos)
  if (!authLoading && user && !profile) {
    if (!showProfileError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold">Carregando perfil...</h2>
            <p className="text-muted-foreground">Aguarde enquanto carregamos suas informações</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-semibold mb-4">Perfil não encontrado</h2>
          <p className="text-muted-foreground mb-4">
            Sua conta não possui um perfil configurado ou houve um problema ao carregá-lo. Por favor, entre em contato com o administrador ou tente fazer logout e login novamente.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => window.location.reload()}>
              Tentar Novamente
            </Button>
            <Button onClick={() => signOut()}>Fazer Logout</Button>
          </div>
        </div>
      </div>
    );
  }

  // Mostrar loading apenas se realmente estiver carregando E tiver usuário e perfil
  if (loading && user && profile && authFilters !== null && clients.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold">Carregando dados...</h2>
          <p className="text-muted-foreground">Conectando com Supabase</p>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <StepByStepForm
        onClientSubmit={handleAddClient}
        onCancel={handleCancelForm}
      />
    );
  }

  if (showClientManager) {
    return (
      <ClientManager
        clients={clients}
        selectedPlanner={selectedPlanner}
        onBack={handleBackToDashboard}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        authFilters={authFilters}
      />
    );
  }

  return (
    <Dashboard
      clients={clients}
      onBulkImport={handleBulkImport}
      onManageClients={() => handleManageClients()}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      authFilters={authFilters}
    />
  );
};

export default Index;
