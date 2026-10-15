import { useState } from 'react';
import { calcularRangoPreset } from './format.js';

const PRESETS_BASE = [
  { value: 'mes-actual', label: 'Este mes' },
  { value: 'mes-pasado', label: 'Mes pasado' },
  { value: 'anio-actual', label: 'Este año' },
  { value: 'personalizado', label: 'Personalizado' },
];

const PRESET_TODO = { value: 'todo', label: 'Todo el historial' };

// rango === null significa "sin filtro": ya sea porque se eligió "Todo el
// historial" (incluirTodo) o porque el rango personalizado todavía no se
// completó con ambas fechas.
export function useRangoFecha({ incluirTodo = false } = {}) {
  const [preset, setPreset] = useState(incluirTodo ? 'todo' : 'mes-actual');
  const [desdeInput, setDesdeInput] = useState('');
  const [hastaInput, setHastaInput] = useState('');

  const presets = incluirTodo ? [PRESET_TODO, ...PRESETS_BASE] : PRESETS_BASE;

  let rango;
  if (preset === 'todo') {
    rango = null;
  } else if (preset === 'personalizado') {
    rango = desdeInput && hastaInput ? { desde: desdeInput, hasta: hastaInput } : null;
  } else {
    rango = calcularRangoPreset(preset);
  }

  return { preset, setPreset, desdeInput, setDesdeInput, hastaInput, setHastaInput, presets, rango };
}
