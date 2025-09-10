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
  const colorClass = getHealthCategoryColor(category);
  
  return (
    <Badge 
      className={cn(
        "font-semibold px-3 py-1 text-sm",
        `text-${colorClass} bg-${colorClass}-bg border border-${colorClass}/20`,
        className
      )}
    >
      {category} ({score})
    </Badge>
  );
}