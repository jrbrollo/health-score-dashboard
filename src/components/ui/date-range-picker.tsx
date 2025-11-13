import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface DatePickerWithRangeProps {
  date: {
    from: Date;
    to: Date;
  };
  onDateChange: (date: { from: Date; to: Date }) => void;
  className?: string;
  minDate?: Date; // Data mínima permitida
}

export const DatePickerWithRange: React.FC<DatePickerWithRangeProps> = ({
  date,
  onDateChange,
  className,
  minDate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempRange, setTempRange] = useState<{ from?: Date; to?: Date }>({});

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;

    // Se não temos data inicial, define como data inicial
    if (!tempRange.from) {
      setTempRange({ from: selectedDate, to: undefined });
      return;
    }

    // Se já temos data inicial, define como data final
    if (tempRange.from && !tempRange.to) {
      const newRange = {
        from: tempRange.from,
        to: selectedDate
      };
      
      // Garante que 'from' seja sempre menor ou igual a 'to'
      if (selectedDate < tempRange.from) {
        newRange.from = selectedDate;
        newRange.to = tempRange.from;
      }
      
      onDateChange(newRange);
      setTempRange({});
      setIsOpen(false);
      return;
    }

    // Se já temos ambas, reseta e começa nova seleção
    setTempRange({ from: selectedDate, to: undefined });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Quando abre, inicializa com o range atual
      setTempRange({ from: date.from, to: date.to });
    } else {
      // Quando fecha, reseta o range temporário
      setTempRange({});
    }
  };

  const currentRange = tempRange.from ? tempRange : date;

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {date?.from ? (
            date.to ? (
              <>
                {format(date.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                {format(date.to, "dd/MM/yyyy", { locale: ptBR })}
              </>
            ) : (
              format(date.from, "dd/MM/yyyy", { locale: ptBR })
            )
          ) : (
            <span>Selecionar período</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
            {!tempRange.from ? "Clique na data inicial" : 
             !tempRange.to ? "Clique na data final" : 
             "Período selecionado"}
          </div>
          <Calendar
            mode="single"
            defaultMonth={currentRange.from}
            selected={tempRange.from}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            locale={ptBR}
            disabled={(date) => {
              // Desabilitar datas antes da data mínima (se especificada)
              if (minDate && date < minDate) {
                return true;
              }
              // Se já temos data inicial, desabilita datas antes dela
              if (tempRange.from && !tempRange.to) {
                return date < tempRange.from;
              }
              return false;
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
