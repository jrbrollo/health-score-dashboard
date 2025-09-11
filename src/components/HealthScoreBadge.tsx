import { HealthCategory } from "@/types/client";
import { getHealthCategoryColor } from "@/utils/healthScore";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface HealthScoreBadgeProps {
  category: HealthCategory;
  score: number;
  className?: string;
}

export function HealthScoreBadge({ category, score, className }: HealthScoreBadgeProps) {
  const getBadgeClass = (category: HealthCategory) => {
    switch (category) {
      case "Ótimo":
        return "health-badge-otimo";
      case "Estável":
        return "health-badge-estavel";
      case "Atenção":
        return "health-badge-atencao";
      case "Crítico":
        return "health-badge-critico";
      default:
        return "health-badge-critico";
    }
  };
  
  return (
    <Badge 
      className={cn(
        "px-4 py-2 text-sm font-bold transition-all duration-200 hover:scale-105",
        getBadgeClass(category),
        className
      )}
    >
      {category} ({score})
    </Badge>
  );
}