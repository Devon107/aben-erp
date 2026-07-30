const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function money(n) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD' }).format(n || 0);
}

// Solo para mostrar: redondea a 2 decimales el texto de horas (las sumas en
// SQL pueden arrastrar cola de punto flotante, ej. 49.370000000000005). El
// valor numérico original no se toca — se sigue usando intacto en cálculos
// como margen_por_hora en calcularAlertas().
export function horasTexto(n) {
  return (n ?? 0).toFixed(2);
}

export function fechaCorta(iso) {
  if (!iso) return '';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, , mes, dia] = match;
  return `${dia} ${MESES_CORTOS[Number(mes) - 1]}`;
}

export function isoDateLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

export function horasYMinutosADecimal(horas, minutos) {
  return Math.round((Number(horas || 0) + Number(minutos || 0) / 60) * 100) / 100;
}

export function decimalAHorasYMinutos(decimal) {
  const totalMinutos = Math.round(Number(decimal || 0) * 60);
  return { horas: Math.floor(totalMinutos / 60), minutos: totalMinutos % 60 };
}

export function formatElapsed(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export function calcularRangoPreset(preset) {
  const hoy = new Date();
  if (preset === 'mes-actual') {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return { desde: isoDateLocal(desde), hasta: isoDateLocal(hasta) };
  }
  if (preset === 'mes-pasado') {
    const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    return { desde: isoDateLocal(desde), hasta: isoDateLocal(hasta) };
  }
  if (preset === 'anio-actual') {
    const desde = new Date(hoy.getFullYear(), 0, 1);
    const hasta = new Date(hoy.getFullYear(), 11, 31);
    return { desde: isoDateLocal(desde), hasta: isoDateLocal(hasta) };
  }
  return null; // 'personalizado' se resuelve leyendo los inputs de fecha
}
