// Funciones puras sin dependencias del DOM, compartidas entre el frontend
// (cargado como <script> global) y los tests (requeridas como módulo CommonJS).

function calcularAlertas(clientesData) {
  const conHoras = clientesData.filter((c) => c.total_horas > 0);
  let promedioHoras = 0;
  let promedioMargenPorHora = 0;
  if (conHoras.length > 0) {
    promedioHoras = conHoras.reduce((s, c) => s + c.total_horas, 0) / conHoras.length;
    promedioMargenPorHora =
      conHoras.reduce((s, c) => s + c.margen / c.total_horas, 0) / conHoras.length;
  }

  return clientesData.map((c) => {
    const margenPorHora = c.total_horas > 0 ? c.margen / c.total_horas : null;
    let alerta = null;
    if (c.margen < 0) {
      alerta = 'perdida';
    } else if (
      c.total_horas > 0 &&
      c.total_horas >= promedioHoras &&
      margenPorHora < promedioMargenPorHora
    ) {
      alerta = 'bajo-rendimiento';
    }
    return { ...c, alerta, margen_por_hora: margenPorHora };
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calcularAlertas };
}
