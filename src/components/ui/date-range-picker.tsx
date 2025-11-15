import React, { useState, useMemo, useEffect } from 'react';
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
  maxDate?: Date; // Data máxima permitida
}

export const DatePickerWithRange: React.FC<DatePickerWithRangeProps> = ({
  date,
  onDateChange,
  className,
  minDate,
  maxDate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempRange, setTempRange] = useState<{ from?: Date; to?: Date }>({ from: undefined, to: undefined });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      // Quando abre, inicializa com o range atual
      setTempRange({ from: date.from, to: date.to });
    } else {
      // Quando fecha, reseta o range temporário (mas mantém estrutura)
      setTempRange({ from: undefined, to: undefined });
    }
  };

  const currentRange = tempRange.from ? tempRange : date;
  
  // Calcular o mês padrão do calendário, garantindo que não ultrapasse maxDate
  const getDefaultMonth = useMemo(() => {
    const baseDate = currentRange.from || new Date();
    const normalizedBaseDate = new Date(baseDate);
    normalizedBaseDate.setHours(0, 0, 0, 0);
    
    if (maxDate) {
      const normalizedMaxDate = new Date(maxDate);
      normalizedMaxDate.setHours(0, 0, 0, 0);
      // Se a data base for depois de maxDate, usar maxDate
      if (normalizedBaseDate > normalizedMaxDate) {
        return normalizedMaxDate;
      }
    }
    
    // Garantir que não seja antes de minDate
    if (minDate) {
      const normalizedMinDate = new Date(minDate);
      normalizedMinDate.setHours(0, 0, 0, 0);
      if (normalizedBaseDate < normalizedMinDate) {
        return normalizedMinDate;
      }
    }
    
    return normalizedBaseDate;
  }, [currentRange.from, minDate, maxDate]);

  // Log de debug quando o componente renderiza
  useEffect(() => {
    if (isOpen) {
      console.log('📅 DatePicker aberto:', {
        minDate: minDate ? format(minDate, 'dd/MM/yyyy') : 'não definido',
        maxDate: maxDate ? format(maxDate, 'dd/MM/yyyy') : 'não definido (sem limite)',
        maxDateValue: maxDate, // Log do valor real para debug
        tempRange: {
          from: tempRange.from ? format(tempRange.from, 'dd/MM/yyyy') : 'não definido',
          to: tempRange.to ? format(tempRange.to, 'dd/MM/yyyy') : 'não definido'
        }
      });
    }
  }, [isOpen, minDate, maxDate, tempRange]);

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
            mode="range"
            defaultMonth={getDefaultMonth}
            selected={{
              from: tempRange.from,
              to: tempRange.to
            }}
            {...(maxDate ? { toDate: maxDate } : {})}
            onSelect={(range) => {
              console.log('📅 DatePicker onSelect chamado:', {
                range,
                maxDate: maxDate ? format(maxDate, 'dd/MM/yyyy') : 'não definido',
                minDate: minDate ? format(minDate, 'dd/MM/yyyy') : 'não definido',
                tempRange
              });
              
              // Se range é undefined, pode ser um clique para limpar ou em data desabilitada
              // Mas também pode ser que o usuário clicou na mesma data duas vezes
              if (!range) {
                console.log('⚠️ Range é null/undefined - verificando se é clique duplo na mesma data');
                
                // Se já temos uma data inicial selecionada e o usuário clicou na mesma data novamente,
                // completar o range com a mesma data (range de um único dia)
                if (tempRange.from) {
                  console.log('📅 Completando range com a mesma data (range de um único dia)');
                  const normalizedFrom = new Date(tempRange.from);
                  normalizedFrom.setHours(0, 0, 0, 0);
                  onDateChange({ from: normalizedFrom, to: normalizedFrom });
                  setTempRange({ from: undefined, to: undefined });
                  setIsOpen(false);
                  return;
                }
                
                // Caso contrário, ignorar (pode ser clique em data desabilitada)
                return;
              }
              
              // Se range não tem from nem to, também ignoramos
              if (!range.from && !range.to) {
                console.log('⚠️ Range vazio, ignorando');
                return;
              }
              
              // Se range tem from mas não tem to, ainda está selecionando a data inicial
              if (range.from && !range.to) {
                // Validar que a data está dentro dos limites
                const selectedDate = new Date(range.from);
                selectedDate.setHours(0, 0, 0, 0);
                
                let isValid = true;
                if (minDate) {
                  const normalizedMinDate = new Date(minDate);
                  normalizedMinDate.setHours(0, 0, 0, 0);
                  if (selectedDate < normalizedMinDate) {
                    isValid = false;
                  }
                }
                if (maxDate) {
                  const normalizedMaxDate = new Date(maxDate);
                  normalizedMaxDate.setHours(0, 0, 0, 0);
                  if (selectedDate > normalizedMaxDate) {
                    isValid = false;
                  }
                }
                
                if (isValid) {
                  // Se já temos uma data inicial e o usuário clica na mesma data,
                  // completar o range com a mesma data (range de um único dia)
                  if (tempRange.from) {
                    const normalizedFrom = new Date(tempRange.from);
                    normalizedFrom.setHours(0, 0, 0, 0);
                    if (normalizedFrom.getTime() === selectedDate.getTime()) {
                      console.log('📅 Mesma data clicada duas vezes - criando range de um único dia');
                      onDateChange({ from: selectedDate, to: selectedDate });
                      setTempRange({ from: undefined, to: undefined });
                      setIsOpen(false);
                      return;
                    }
                  }
                  
                  console.log('📅 Selecionando data inicial:', range.from);
                  setTempRange({ from: range.from, to: undefined });
                } else {
                  console.log('⚠️ Data selecionada está fora dos limites, ignorando');
                }
                return;
              }
              
              // Se range tem from e to, completou a seleção
              if (range.from && range.to) {
                console.log('📅 Range completo selecionado:', { from: range.from, to: range.to });
                const normalizedFrom = new Date(range.from);
                normalizedFrom.setHours(0, 0, 0, 0);
                const normalizedTo = new Date(range.to);
                normalizedTo.setHours(0, 0, 0, 0);
                
                // Validar contra minDate
                if (minDate) {
                  const normalizedMinDate = new Date(minDate);
                  normalizedMinDate.setHours(0, 0, 0, 0);
                  if (normalizedFrom < normalizedMinDate) {
                    console.log('⚠️ Ajustando from para minDate:', normalizedMinDate);
                    normalizedFrom.setTime(normalizedMinDate.getTime());
                  }
                }
                
                // Validar contra maxDate
                if (maxDate) {
                  const normalizedMaxDate = new Date(maxDate);
                  normalizedMaxDate.setHours(0, 0, 0, 0);
                  if (normalizedTo > normalizedMaxDate) {
                    console.log('⚠️ Ajustando to para maxDate:', normalizedMaxDate);
                    normalizedTo.setTime(normalizedMaxDate.getTime());
                  }
                }
                
                // Garantir que from <= to
                if (normalizedFrom.getTime() > normalizedTo.getTime()) {
                  console.log('⚠️ Invertendo from e to');
                  const temp = new Date(normalizedFrom);
                  normalizedFrom.setTime(normalizedTo.getTime());
                  normalizedTo.setTime(temp.getTime());
                }
                
                console.log('✅ Chamando onDateChange com:', { from: normalizedFrom, to: normalizedTo });
                onDateChange({ from: normalizedFrom, to: normalizedTo });
                setTempRange({ from: undefined, to: undefined });
                setIsOpen(false);
                return;
              }
            }}
            numberOfMonths={2}
            locale={ptBR}
            fromDate={minDate}
            disabled={(dateToCheck) => {
              // Normalizar a data para comparação (remover horas)
              const normalizedDate = new Date(dateToCheck);
              normalizedDate.setHours(0, 0, 0, 0);
              
              // Desabilitar datas antes da data mínima (se especificada)
              if (minDate) {
                const normalizedMinDate = new Date(minDate);
                normalizedMinDate.setHours(0, 0, 0, 0);
                if (normalizedDate < normalizedMinDate) {
                  return true;
                }
              }
              
              // Desabilitar datas depois da data máxima (se especificada)
              if (maxDate) {
                const normalizedMaxDate = new Date(maxDate);
                normalizedMaxDate.setHours(0, 0, 0, 0);
                if (normalizedDate > normalizedMaxDate) {
                  return true;
                }
              }
              
              // Data habilitada
              return false;
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};
