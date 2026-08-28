import * as React from 'react';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

export default function AppointmentDateTimePicker({ value, onChange }) {
  // Fecha actual + 1 hora si no viene un valor definido
  const selectedDate = value ? dayjs(value) : dayjs().add(1, 'hour');

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DateTimePicker
        label="Fecha y hora programada"
        value={selectedDate}
        onChange={(newValue) => {
          // Devuelve el valor formateado en ISO String para la API
          onChange(newValue ? newValue.toISOString() : '');
        }}
        slotProps={{
          textField: {
            size: 'small',
            fullWidth: true,
            variant: 'outlined',
            required: true,
          },
        }}
      />
    </LocalizationProvider>
  );
}