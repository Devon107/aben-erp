const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularAlertas } = require('../public/logic');

test('calcularAlertas: margen negativo siempre es alerta de perdida', () => {
  const [c] = calcularAlertas([{ cliente_id: 1, total_horas: 10, margen: -50 }]);
  assert.equal(c.alerta, 'perdida');
});

test('calcularAlertas: sin horas no hay alerta de bajo rendimiento', () => {
  const [c] = calcularAlertas([{ cliente_id: 1, total_horas: 0, margen: 100 }]);
  assert.equal(c.alerta, null);
  assert.equal(c.margen_por_hora, null);
});

test('calcularAlertas: bajo rendimiento cuando las horas alcanzan el promedio y el margen/hora esta por debajo', () => {
  const clientes = [
    { cliente_id: 1, total_horas: 10, margen: 1000 }, // 100/h
    { cliente_id: 2, total_horas: 10, margen: 100 }, // 10/h
  ];
  const resultado = calcularAlertas(clientes);
  assert.equal(resultado.find((c) => c.cliente_id === 2).alerta, 'bajo-rendimiento');
  assert.equal(resultado.find((c) => c.cliente_id === 1).alerta, null);
});

test('calcularAlertas: pocas horas (por debajo del promedio) no dispara bajo rendimiento aunque el margen/hora sea bajo', () => {
  const clientes = [
    { cliente_id: 1, total_horas: 20, margen: 2000 }, // 100/h
    { cliente_id: 2, total_horas: 1, margen: 1 }, // 1/h, pero muy pocas horas
  ];
  const resultado = calcularAlertas(clientes);
  assert.equal(resultado.find((c) => c.cliente_id === 2).alerta, null);
});
