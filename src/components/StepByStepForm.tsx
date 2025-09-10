import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, ArrowRight, CheckCircle } from "lucide-react";
import { Client, Planner, LastMeeting, AppUsage, PaymentStatus, NPSScore, EcosystemUsage } from "@/types/client";
import { toast } from "@/hooks/use-toast";

interface StepByStepFormProps {
  onClientSubmit: (client: Omit<Client, "id" | "createdAt" | "updatedAt">) => void;
  onCancel: () => void;
}

const planners: Planner[] = ["Barroso", "Rossetti", "Ton", "Bizelli", "Abraão", "Murilo", "Felipe", "Hélio", "Vinícius"];

const steps = [
  { id: 1, title: "Informações Básicas", description: "Nome do cliente e planejador responsável" },
  { id: 2, title: "Engajamento em Reuniões", description: "Última reunião e agendamentos futuros" },
  { id: 3, title: "Uso do App/Planilha", description: "Como o cliente usa as ferramentas financeiras" },
  { id: 4, title: "Status de Pagamento", description: "Situação das parcelas do cliente" },
  { id: 5, title: "Engajamento no Ecossistema", description: "Uso de outras áreas e indicações" },
  { id: 6, title: "NPS e Finalização", description: "Nota de satisfação do cliente" },
];

export function StepByStepForm({ onClientSubmit, onCancel }: StepByStepFormProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    planner: undefined as Planner | undefined,
    lastMeeting: undefined as LastMeeting | undefined,
    hasScheduledMeeting: false,
    appUsage: undefined as AppUsage | undefined,
    paymentStatus: undefined as PaymentStatus | undefined,
    hasReferrals: false,
    npsScore: undefined as NPSScore | undefined,
    ecosystemUsage: undefined as EcosystemUsage | undefined,
  });

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = () => {
    // Validate all required fields
    if (!formData.name || !formData.planner || !formData.lastMeeting || 
        !formData.appUsage || !formData.paymentStatus || !formData.npsScore || 
        !formData.ecosystemUsage) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos antes de finalizar.",
        variant: "destructive",
      });
      return;
    }

    onClientSubmit({
      ...formData,
      planner: formData.planner!,
      lastMeeting: formData.lastMeeting!,
      appUsage: formData.appUsage!,
      paymentStatus: formData.paymentStatus!,
      npsScore: formData.npsScore!,
      ecosystemUsage: formData.ecosystemUsage!,
    });
    toast({
      title: "Cliente cadastrado!",
      description: `${formData.name} foi adicionado à carteira de ${formData.planner}.`,
    });
  };

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.name.trim() !== "" && formData.planner !== undefined;
      case 2:
        return formData.lastMeeting !== undefined;
      case 3:
        return formData.appUsage !== undefined;
      case 4:
        return formData.paymentStatus !== undefined;
      case 5:
        return formData.ecosystemUsage !== undefined;
      case 6:
        return formData.npsScore !== undefined;
      default:
        return false;
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Cliente</Label>
              <Input
                id="name"
                placeholder="Digite o nome completo do cliente"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planner">Planejador Responsável</Label>
              <Select value={formData.planner} onValueChange={(value: Planner) => setFormData({ ...formData, planner: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o planejador" />
                </SelectTrigger>
                <SelectContent>
                  {planners.map((planner) => (
                    <SelectItem key={planner} value={planner}>
                      {planner}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label>Quando foi a última reunião com o cliente?</Label>
              <RadioGroup
                value={formData.lastMeeting}
                onValueChange={(value: LastMeeting) => setFormData({ ...formData, lastMeeting: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="< 30 dias" id="meeting-recent" />
                  <Label htmlFor="meeting-recent">Menos de 30 dias atrás</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="31-60 dias" id="meeting-medium" />
                  <Label htmlFor="meeting-medium">Entre 31 e 60 dias atrás</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="> 60 dias" id="meeting-old" />
                  <Label htmlFor="meeting-old">Mais de 60 dias atrás</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-4">
              <Label>Existe uma próxima reunião agendada?</Label>
              <RadioGroup
                value={formData.hasScheduledMeeting ? "sim" : "nao"}
                onValueChange={(value) => setFormData({ ...formData, hasScheduledMeeting: value === "sim" })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sim" id="scheduled-yes" />
                  <Label htmlFor="scheduled-yes">Sim, já está agendada</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nao" id="scheduled-no" />
                  <Label htmlFor="scheduled-no">Não, ainda não foi agendada</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <Label>Como o cliente tem usado o App/Planilha de gastos?</Label>
            <RadioGroup
              value={formData.appUsage}
              onValueChange={(value: AppUsage) => setFormData({ ...formData, appUsage: value })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Acessou e categorizou (15 dias)" id="app-full" />
                <Label htmlFor="app-full">Acessou e categorizou nos últimos 15 dias</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Acessou, sem categorização" id="app-partial" />
                <Label htmlFor="app-partial">Acessou o app, mas sem categorizar</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Sem acesso/categorização (30+ dias)" id="app-none" />
                <Label htmlFor="app-none">Não acessou/categorizou nos últimos 30 dias</Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <Label>Qual a situação de pagamento do cliente?</Label>
            <RadioGroup
              value={formData.paymentStatus}
              onValueChange={(value: PaymentStatus) => setFormData({ ...formData, paymentStatus: value })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Pagamento em dia" id="payment-ok" />
                <Label htmlFor="payment-ok">Pagamentos em dia</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="1 parcela em atraso" id="payment-1" />
                <Label htmlFor="payment-1">1 parcela em atraso</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="2 parcelas em atraso" id="payment-2" />
                <Label htmlFor="payment-2">2 parcelas em atraso</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="3+ parcelas em atraso" id="payment-3plus" />
                <Label htmlFor="payment-3plus">3+ parcelas em atraso</Label>
              </div>
            </RadioGroup>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <Label>O cliente utilizou outras áreas da Braúna nos últimos 6 meses?</Label>
              <RadioGroup
                value={formData.ecosystemUsage}
                onValueChange={(value: EcosystemUsage) => setFormData({ ...formData, ecosystemUsage: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Usou 2+ áreas" id="ecosystem-multi" />
                  <Label htmlFor="ecosystem-multi">Usou 2 ou mais áreas</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Usou 1 área" id="ecosystem-single" />
                  <Label htmlFor="ecosystem-single">Usou apenas 1 área</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="Não usou" id="ecosystem-none" />
                  <Label htmlFor="ecosystem-none">Não utilizou outras áreas</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-4">
              <Label>O cliente gerou indicações nos últimos 6 meses?</Label>
              <RadioGroup
                value={formData.hasReferrals ? "sim" : "nao"}
                onValueChange={(value) => setFormData({ ...formData, hasReferrals: value === "sim" })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sim" id="referrals-yes" />
                  <Label htmlFor="referrals-yes">Sim, indicou novos clientes</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="nao" id="referrals-no" />
                  <Label htmlFor="referrals-no">Não fez indicações</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <Label>Qual a última nota de NPS do cliente?</Label>
            <RadioGroup
              value={formData.npsScore}
              onValueChange={(value: NPSScore) => setFormData({ ...formData, npsScore: value })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Promotor (9-10)" id="nps-promotor" />
                <Label htmlFor="nps-promotor">Promotor (nota 9-10)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Neutro (7-8)" id="nps-neutral" />
                <Label htmlFor="nps-neutral">Neutro (nota 7-8)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="Detrator (0-6)" id="nps-detractor" />
                <Label htmlFor="nps-detractor">Detrator (nota 0-6)</Label>
              </div>
            </RadioGroup>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Card className="bg-gradient-to-br from-background to-secondary/30 border-0 shadow-[var(--shadow-card)]">
        <CardHeader className="text-center pb-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-2 w-2 rounded-full bg-primary"></div>
            <div className="h-1 flex-1 bg-border rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-300"
                style={{ width: `${(currentStep / steps.length) * 100}%` }}
              />
            </div>
            <div className="h-2 w-2 rounded-full bg-primary"></div>
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            {steps[currentStep - 1].title}
          </CardTitle>
          <CardDescription className="text-base">
            {steps[currentStep - 1].description}
          </CardDescription>
          <div className="text-sm text-muted-foreground mt-2">
            Passo {currentStep} de {steps.length}
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          {renderStepContent()}
          
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={currentStep === 1 ? onCancel : handlePrevious}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              {currentStep === 1 ? "Cancelar" : "Anterior"}
            </Button>
            
            {currentStep === steps.length ? (
              <Button
                onClick={handleSubmit}
                className="flex items-center gap-2 bg-[var(--gradient-primary)]"
                disabled={!isStepValid()}
              >
                <CheckCircle className="h-4 w-4" />
                Finalizar Cadastro
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                className="flex items-center gap-2"
                disabled={!isStepValid()}
              >
                Próximo
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}