function notFound(res, entity) {
  return res.status(404).json({ error: `${entity} no encontrado` });
}

function esNumeroNoNegativo(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

// La API habla en dólares (como antes); la base de datos guarda centavos
// (INTEGER) para evitar errores de redondeo de punto flotante en montos.
function aCentavos(dolares) {
  return Math.round(dolares * 100);
}

function aDolares(centavos) {
  return centavos == null ? null : centavos / 100;
}

function validarEnum(valor, opciones, nombreCampo) {
  if (!opciones.includes(valor)) return `${nombreCampo} invalido`;
  return null;
}

function requerirNumeroPositivo(valor, nombreCampo) {
  if (!esNumeroNoNegativo(valor)) return `${nombreCampo} debe ser un numero no negativo`;
  return null;
}

module.exports = {
  notFound,
  esNumeroNoNegativo,
  aCentavos,
  aDolares,
  validarEnum,
  requerirNumeroPositivo,
};
