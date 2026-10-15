const express = require('express');
const { notFound, validarEnum } = require('../lib/http');
const { calcularResumenCliente, listarProyectosConProgreso, listarActividadesCliente } = require('../db/queries');

const MODOS_FACTURACION = ['hora', 'proyecto', 'mixto'];
const CAMPOS_EMPRESA = ['email', 'telefono', 'industria', 'sitio_web', 'direccion', 'contacto_principal', 'cliente_desde'];

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
    const empresa = CAMPOS_EMPRESA.map((campo) => req.body[campo] ?? null);

    const info = db
      .prepare(
        `INSERT INTO clientes (nombre, modo_facturacion, email, telefono, industria, sitio_web, direccion, contacto_principal, cliente_desde)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(nombre, modo_facturacion, ...empresa);
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
    const empresa = CAMPOS_EMPRESA.map((campo) => req.body[campo] ?? existing[campo]);

    db.prepare(
      `UPDATE clientes
       SET nombre = ?, modo_facturacion = ?, email = ?, telefono = ?, industria = ?,
           sitio_web = ?, direccion = ?, contacto_principal = ?, cliente_desde = ?
       WHERE id = ?`
    ).run(nombre, modo_facturacion, ...empresa, req.params.id);
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    res.json(cliente);
  });

  router.delete('/:id', (req, res) => {
    const info = db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return notFound(res, 'Cliente');
    res.status(204).end();
  });

  router.get('/:id/resumen', (req, res) => {
    const cliente = db.prepare('SELECT id FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return notFound(res, 'Cliente');

    res.json({
      kpis: calcularResumenCliente(db, req.params.id),
      proyectos: listarProyectosConProgreso(db, req.params.id),
      actividad: listarActividadesCliente(db, req.params.id),
    });
  });

  return router;
}

module.exports = crearRouter;
