import React from 'react';
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
}

export const DatePickerWithRange: React.FC<DatePickerWithRangeProps> = ({
  date,
  onDateChange,
  className
}) => {
  return (
    <Popover>
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
        <Calendar
          mode="range"
          defaultMonth={date?.from}
          selected={date}
          onSelect={(range) => {
            if (range?.from && range?.to) {
              onDateChange({
                from: range.from,
                to: range.to
              });
            }
          }}
          numberOfMonths={2}
          locale={ptBR}
        />
      </PopoverContent>
    </Popover>
  );
};
