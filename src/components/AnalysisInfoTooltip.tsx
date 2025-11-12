import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface AnalysisInfoTooltipProps {
  title: string;
  description: string;
  tips?: string[];
}

export function AnalysisInfoTooltip({ title, description, tips }: AnalysisInfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Informações sobre esta análise"
          >
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm p-4" side="right" align="start">
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">{title}</h4>
            <p className="text-xs text-muted-foreground">{description}</p>
            {tips && tips.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-medium mb-2">O que observar:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  {tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

