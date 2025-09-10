import { useState } from "react";
import { Client } from "@/types/client";
import { Dashboard } from "@/components/Dashboard";
import { StepByStepForm } from "@/components/StepByStepForm";

const Index = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [showForm, setShowForm] = useState(false);

  const handleAddClient = (clientData: Omit<Client, "id" | "createdAt" | "updatedAt">) => {
    const newClient: Client = {
      ...clientData,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    setClients(prev => [...prev, newClient]);
    setShowForm(false);
  };

  const handleCancelForm = () => {
    setShowForm(false);
  };

  if (showForm) {
    return (
      <StepByStepForm
        onClientSubmit={handleAddClient}
        onCancel={handleCancelForm}
      />
    );
  }

  return (
    <Dashboard
      clients={clients}
      onAddClient={() => setShowForm(true)}
    />
  );
};

export default Index;
