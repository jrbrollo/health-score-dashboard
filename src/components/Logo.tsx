import { Activity, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  isDarkMode?: boolean;
}

export function Logo({ className, isDarkMode = false }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative">
        {/* Ícone principal com gradiente */}
        <div className={cn(
          "relative flex items-center justify-center rounded-xl p-3",
          isDarkMode 
            ? "bg-gradient-to-br from-emerald-500/20 to-green-600/20 border border-emerald-500/30" 
            : "bg-gradient-to-br from-emerald-100 to-green-100 border border-emerald-200"
        )}>
          <Heart 
            className={cn(
              "h-8 w-8",
              isDarkMode ? "text-emerald-400" : "text-emerald-600"
            )}
            fill={isDarkMode ? "#34d399" : "#059669"}
          />
          <Activity 
            className={cn(
              "absolute -bottom-1 -right-1 h-5 w-5 rounded-full p-0.5",
              isDarkMode ? "bg-emerald-500 text-emerald-50" : "bg-emerald-600 text-white"
            )}
          />
        </div>
      </div>
      <div className="flex flex-col">
        <h1 className={cn(
          "text-3xl font-bold tracking-tight leading-tight whitespace-nowrap",
          isDarkMode 
            ? "bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 bg-clip-text text-transparent"
            : "bg-gradient-to-r from-emerald-600 via-green-600 to-emerald-700 bg-clip-text text-transparent"
        )}>
          Health Score
        </h1>
        <p className={cn(
          "text-lg font-medium tracking-wide mt-0.5",
          isDarkMode ? "text-emerald-300/70" : "text-emerald-600/70"
        )}>
          Dashboard
        </p>
      </div>
    </div>
  );
}

