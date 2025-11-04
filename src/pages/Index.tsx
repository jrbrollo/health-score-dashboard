import { useState, useEffect } from "react";
import { Client, Planner, BulkImportPayload } from "@/types/client";
import { Dashboard } from "@/components/Dashboard";
import { clientService } from "@/services/clientService";
import { toast } from "@/hooks/use-toast";

const Index = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showClientManager, setShowClientManager] = useState(false);
  const [selectedPlanner, setSelectedPlanner] = useState<Planner | "all">("all");
  const [loading, setLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Carregar clientes do Supabase ao inicializar
  useEffect(() => {
    loadClients();
  }, []);

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
      const clientsData = await clientService.getAllClients();
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

  // Tela de loading
  if (loading) {
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
        onUpdateClient={handleUpdateClient}
        onDeleteClient={handleDeleteClient}
        onBack={handleBackToDashboard}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />
    );
  }

  return (
    <Dashboard
      clients={clients}
      onBulkImport={handleBulkImport}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
    />
  );
};

export default Index;
