import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Edit, 
  Search, 
  Users, 
  Save, 
  X,
  Filter,
  Calendar,
  CreditCard,
  Smartphone,
  UserCheck,
  Star,
  Building
} from "lucide-react";
import { Client, Planner, LastMeeting, AppUsage, PaymentStatus, NPSScore, EcosystemUsage } from "@/types/client";
import { calculateHealthScore } from "@/utils/healthScore";
import { HealthScoreBadge } from "./HealthScoreBadge";
import { ThemeToggle } from "./ui/theme-toggle";
import { toast } from "@/hooks/use-toast";

interface ClientManagerProps {
  clients: Client[];
  selectedPlanner: Planner | "all";
  onUpdateClient: (clientId: string, updatedData: Partial<Client>) => void;
  onBack: () => void;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
}

const planners: Planner[] = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraao", "Murilo", "Felipe", "Helio", "Vinícius"];

export function ClientManager({ clients, selectedPlanner, onUpdateClient, onBack, isDarkMode = false, onToggleDarkMode }: ClientManagerProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [editingClient, setEditingClient] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Client>>({});
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPlanner, setFilterPlanner] = useState<Planner | "all">(selectedPlanner);

  // Filtrar clientes
  const filteredClients = useMemo(() => {
    let filtered = filterPlanner === "all" 
      ? clients 
      : clients.filter(c => c.planner === filterPlanner);

    if (searchTerm) {
      filtered = filtered.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterCategory !== "all") {
      filtered = filtered.filter(c => {
        const healthScore = calculateHealthScore(c);
        return healthScore.category === filterCategory;
      });
    }

    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, filterPlanner, searchTerm, filterCategory]);

  const handleEdit = (client: Client) => {
    setEditingClient(client.id);
    setEditForm({
      lastMeeting: client.lastMeeting,
      hasScheduledMeeting: client.hasScheduledMeeting,
      appUsage: client.appUsage,
      paymentStatus: client.paymentStatus,
      hasReferrals: client.hasReferrals,
      npsScore: client.npsScore,
      ecosystemUsage: client.ecosystemUsage,
    });
  };

  const handleSave = () => {
    if (editingClient && editForm) {
      onUpdateClient(editingClient, {
        ...editForm,
        updatedAt: new Date(),
      });
      
      setEditingClient(null);
      setEditForm({});
      
      toast({
        title: "Cliente atualizado!",
        description: "As informações do cliente foram atualizadas com sucesso.",
      });
    }
  };

  const handleCancel = () => {
    setEditingClient(null);
    setEditForm({});
  };

  const getHealthScoreColor = (category: string) => {
    if (isDarkMode) {
      switch (category) {
        case "Ótimo": return "text-green-300 bg-green-900/30 border border-green-700";
        case "Estável": return "text-blue-300 bg-blue-900/30 border border-blue-700";
        case "Atenção": return "text-yellow-300 bg-yellow-900/30 border border-yellow-700";
        case "Crítico": return "text-red-300 bg-red-900/30 border border-red-700";
        default: return "text-gray-300 bg-gray-800/30 border border-gray-600";
      }
    } else {
      switch (category) {
        case "Ótimo": return "text-green-600 bg-green-100";
        case "Estável": return "text-blue-600 bg-blue-100";
        case "Atenção": return "text-yellow-600 bg-yellow-100";
        case "Crítico": return "text-red-600 bg-red-100";
        default: return "text-gray-600 bg-gray-100";
      }
    }
  };

  const renderEditForm = (client: Client) => {
    if (editingClient !== client.id) return null;

    return (
      <div className={`mt-4 p-4 rounded-lg space-y-4 ${isDarkMode ? 'bg-gray-800/50 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Última Reunião */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4" />
              Última reunião
            </Label>
            <Select 
              value={editForm.lastMeeting || client.lastMeeting} 
              onValueChange={(value: LastMeeting) => setEditForm(prev => ({ ...prev, lastMeeting: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="< 30 dias">Menos de 30 dias</SelectItem>
                <SelectItem value="31-60 dias">Entre 31 e 60 dias</SelectItem>
                <SelectItem value="> 60 dias">Mais de 60 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Próxima Reunião */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4" />
              Próxima reunião agendada
            </Label>
            <Select 
              value={editForm.hasScheduledMeeting !== undefined ? (editForm.hasScheduledMeeting ? "sim" : "nao") : (client.hasScheduledMeeting ? "sim" : "nao")}
              onValueChange={(value) => setEditForm(prev => ({ ...prev, hasScheduledMeeting: value === "sim" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim, agendada</SelectItem>
                <SelectItem value="nao">Não agendada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Uso do App */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Smartphone className="h-4 w-4" />
              Uso do app/planilha
            </Label>
            <Select 
              value={editForm.appUsage || client.appUsage} 
              onValueChange={(value: AppUsage) => setEditForm(prev => ({ ...prev, appUsage: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Acessou e categorizou (15 dias)">Acessou e categorizou (15 dias)</SelectItem>
                <SelectItem value="Acessou, sem categorização">Acessou, sem categorização</SelectItem>
                <SelectItem value="Sem acesso/categorização (30+ dias)">Sem acesso (30+ dias)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Pagamento */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <CreditCard className="h-4 w-4" />
              Status de pagamento
            </Label>
            <Select 
              value={editForm.paymentStatus || client.paymentStatus} 
              onValueChange={(value: PaymentStatus) => setEditForm(prev => ({ ...prev, paymentStatus: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pagamento em dia">Pagamento em dia</SelectItem>
                <SelectItem value="1 parcela em atraso">1 parcela em atraso</SelectItem>
                <SelectItem value="2 parcelas em atraso">2 parcelas em atraso</SelectItem>
                <SelectItem value="3+ parcelas em atraso">3+ parcelas em atraso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Indicações */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <UserCheck className="h-4 w-4" />
              Gerou indicações
            </Label>
            <Select 
              value={editForm.hasReferrals !== undefined ? (editForm.hasReferrals ? "sim" : "nao") : (client.hasReferrals ? "sim" : "nao")}
              onValueChange={(value) => setEditForm(prev => ({ ...prev, hasReferrals: value === "sim" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sim">Sim</SelectItem>
                <SelectItem value="nao">Não</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* NPS */}
          <div>
            <Label className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4" />
              Nota NPS
            </Label>
            <Select 
              value={editForm.npsScore || client.npsScore} 
              onValueChange={(value: NPSScore) => setEditForm(prev => ({ ...prev, npsScore: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Promotor (9-10)">Promotor (9-10)</SelectItem>
                <SelectItem value="Neutro (7-8)">Neutro (7-8)</SelectItem>
                <SelectItem value="Detrator (0-6)">Detrator (0-6)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Uso Outras Áreas */}
          <div className="md:col-span-2">
            <Label className="flex items-center gap-2 mb-2">
              <Building className="h-4 w-4" />
              Uso de outras áreas da Braúna
            </Label>
            <Select 
              value={editForm.ecosystemUsage || client.ecosystemUsage} 
              onValueChange={(value: EcosystemUsage) => setEditForm(prev => ({ ...prev, ecosystemUsage: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Usou 2+ áreas">Usou 2 ou mais áreas</SelectItem>
                <SelectItem value="Usou 1 área">Usou 1 área</SelectItem>
                <SelectItem value="Não usou">Não usou outras áreas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className={`min-h-screen p-6 transition-colors duration-300 ${isDarkMode ? 'gradient-bg-dark text-white' : 'gradient-bg-light text-gray-900'}`}>
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Gerenciar Clientes
              </h1>
              <p className="text-muted-foreground text-lg mt-2">
                {filterPlanner === "all" 
                  ? `Visualizando clientes de todos os planejadores (${filteredClients.length} clientes)`
                  : `Visualizando clientes de ${filterPlanner} (${filteredClients.length} clientes)`
                }
              </p>
            </div>
            <ThemeToggle 
              isDark={isDarkMode} 
              onToggle={onToggleDarkMode || (() => {})} 
            />
          </div>
          <Button variant="outline" onClick={onBack} className="shadow-lg">
            Voltar ao Dashboard
          </Button>
        </div>

        {/* Filtros */}
        <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filtros e Busca
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <Label htmlFor="search">Buscar cliente</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="search"
                    placeholder="Digite o nome do cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="planner">Filtrar por planejador</Label>
                <Select value={filterPlanner} onValueChange={(value: Planner | "all") => setFilterPlanner(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os planejadores</SelectItem>
                    {planners.map(planner => (
                      <SelectItem key={planner} value={planner}>
                        {planner}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="category">Filtrar por categoria</Label>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    <SelectItem value="Ótimo">Ótimo</SelectItem>
                    <SelectItem value="Estável">Estável</SelectItem>
                    <SelectItem value="Atenção">Atenção</SelectItem>
                    <SelectItem value="Crítico">Crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de Clientes */}
        <div className="space-y-4">
          {filteredClients.length === 0 ? (
            <Card className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum cliente encontrado</h3>
                <p className="text-muted-foreground text-center">
                  {searchTerm ? "Tente ajustar os filtros de busca." : "Não há clientes cadastrados ainda."}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredClients.map((client) => {
              const healthScore = calculateHealthScore(client);
              
              return (
                <Card key={client.id} className={`animate-fade-in-up ${isDarkMode ? 'gradient-card-dark card-hover-dark' : 'gradient-card-light card-hover'}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div>
                          <h3 className="text-lg font-semibold">{client.name}</h3>
                          <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            Planejador: {client.planner} • 
                            Última atualização: {new Date(client.updatedAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <HealthScoreBadge score={healthScore.score} category={healthScore.category} />
                          <Badge className={getHealthScoreColor(healthScore.category)}>
                            {healthScore.category}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(client)}
                        disabled={editingClient === client.id}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        {editingClient === client.id ? "Editando..." : "Editar"}
                      </Button>
                    </div>

                    {/* Informações rápidas */}
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Última reunião:</span>
                        <p className="font-medium">{client.lastMeeting}</p>
                      </div>
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Próxima reunião:</span>
                        <p className="font-medium">{client.hasScheduledMeeting ? "Agendada" : "Não agendada"}</p>
                      </div>
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Status pagamento:</span>
                        <p className="font-medium">{client.paymentStatus}</p>
                      </div>
                      <div>
                        <span className={`${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>NPS:</span>
                        <p className="font-medium">{client.npsScore}</p>
                      </div>
                    </div>

                    {renderEditForm(client)}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
