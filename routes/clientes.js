const express = require('express');
const { notFound, validarEnum } = require('../lib/http');

const MODOS_FACTURACION = ['hora', 'proyecto', 'mixto'];

function crearRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    const clientes = db.prepare('SELECT * FROM clientes ORDER BY id DESC').all();
    res.json(clientes);
  });

  router.get('/:id', (req, res) => {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return notFound(res, 'Cliente');
    res.json(cliente);
  });

  router.post('/', (req, res) => {
    const { nombre, modo_facturacion } = req.body;
    if (!nombre || !modo_facturacion) {
      return res.status(400).json({ error: 'nombre y modo_facturacion son requeridos' });
    }
    const errorModo = validarEnum(modo_facturacion, MODOS_FACTURACION, 'modo_facturacion');
    if (errorModo) return res.status(400).json({ error: errorModo });

    const info = db
      .prepare('INSERT INTO clientes (nombre, modo_facturacion) VALUES (?, ?)')
      .run(nombre, modo_facturacion);
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(cliente);
  });

  router.put('/:id', (req, res) => {
    const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!existing) return notFound(res, 'Cliente');

    const nombre = req.body.nombre ?? existing.nombre;
    const modo_facturacion = req.body.modo_facturacion ?? existing.modo_facturacion;
    const errorModo = validarEnum(modo_facturacion, MODOS_FACTURACION, 'modo_facturacion');
    if (errorModo) return res.status(400).json({ error: errorModo });

    db.prepare('UPDATE clientes SET nombre = ?, modo_facturacion = ? WHERE id = ?').run(
      nombre,
      modo_facturacion,
      req.params.id
    );
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    res.json(cliente);
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return notFound(res, 'Cliente');
    res.status(204).end();
  });

  return router;
}

module.exports = crearRouter;
