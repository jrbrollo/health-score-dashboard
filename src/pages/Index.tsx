import { useState, useEffect } from "react";
import { Client, Planner } from "@/types/client";
import { Dashboard } from "@/components/Dashboard";
import { StepByStepForm } from "@/components/StepByStepForm";
import { ClientManager } from "@/components/ClientManager";
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

  const handleBulkImport = async (importedClients: Omit<Client, "id" | "createdAt" | "updatedAt">[]) => {
    try {
      const newClients = await clientService.createMultipleClients(importedClients);
      if (newClients.length > 0) {
        setClients(prev => [...prev, ...newClients]);
        toast({
          title: "Importação concluída!",
          description: `${newClients.length} clientes foram importados com sucesso.`,
        });
      } else {
        throw new Error('Nenhum cliente foi importado');
      }
    } catch (error) {
      console.error('Erro ao importar clientes:', error);
      toast({
        title: "Erro na importação",
        description: "Não foi possível importar os clientes. Tente novamente.",
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
        onBack={handleBackToDashboard}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />
    );
  }

  return (
    <Dashboard
      clients={clients}
      onAddClient={() => setShowForm(true)}
      onBulkImport={handleBulkImport}
      onManageClients={handleManageClients}
      isDarkMode={isDarkMode}
      onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
    />
  );
};

export default Index;
