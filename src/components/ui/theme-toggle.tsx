import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      className={`w-10 h-10 p-0 transition-colors ${
        isDark 
          ? 'border-gray-600 bg-gray-800 hover:bg-gray-700' 
          : 'border-gray-300 bg-white hover:bg-gray-50'
      }`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-yellow-400" />
      ) : (
        <Moon className="h-4 w-4 text-gray-600" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

