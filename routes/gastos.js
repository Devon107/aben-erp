const express = require('express');
const { notFound, aCentavos, aDolares, requerirNumeroPositivo } = require('../lib/http');
const { serializarGasto } = require('../db/queries');

function crearRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const { cliente_id } = req.query;
    let gastos;
    if (cliente_id) {
      gastos = db.prepare('SELECT * FROM gastos WHERE cliente_id = ? ORDER BY fecha DESC, id DESC').all(cliente_id);
    } else {
      gastos = db.prepare('SELECT * FROM gastos ORDER BY fecha DESC, id DESC').all();
    }
    res.json(gastos.map(serializarGasto));
  });

  router.get('/:id', (req, res) => {
    const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
    if (!gasto) return notFound(res, 'Gasto');
    res.json(serializarGasto(gasto));
  });

  router.post('/', (req, res) => {
    const { cliente_id, descripcion, monto, fecha } = req.body;
    if (!cliente_id || !descripcion || monto === undefined) {
      return res.status(400).json({ error: 'cliente_id, descripcion y monto son requeridos' });
    }
    const errorMonto = requerirNumeroPositivo(monto, 'monto');
    if (errorMonto) return res.status(400).json({ error: errorMonto });
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(cliente_id);
    if (!cliente) return res.status(400).json({ error: 'cliente_id no existe' });

    const fechaFinal = fecha || new Date().toISOString().slice(0, 10);

    const info = db
      .prepare('INSERT INTO gastos (cliente_id, descripcion, monto, fecha) VALUES (?, ?, ?, ?)')
      .run(cliente_id, descripcion, aCentavos(monto), fechaFinal);
    const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(serializarGasto(gasto));
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
    if (!existing) return notFound(res, 'Gasto');

    const cliente_id = req.body.cliente_id ?? existing.cliente_id;
    const descripcion = req.body.descripcion ?? existing.descripcion;
    const monto = req.body.monto !== undefined ? req.body.monto : aDolares(existing.monto);
    const fecha = req.body.fecha ?? existing.fecha;

    const errorMonto = requerirNumeroPositivo(monto, 'monto');
    if (errorMonto) return res.status(400).json({ error: errorMonto });

    db.prepare('UPDATE gastos SET cliente_id = ?, descripcion = ?, monto = ?, fecha = ? WHERE id = ?').run(
      cliente_id,
      descripcion,
      aCentavos(monto),
      fecha,
      req.params.id
    );
    const gasto = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
    res.json(serializarGasto(gasto));
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return notFound(res, 'Gasto');
    res.status(204).end();
  });

  return router;
}

module.exports = crearRouter;
