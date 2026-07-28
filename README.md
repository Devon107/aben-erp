# aben-erp

Aplicación web para llevar control de clientes freelance: registro de tiempo trabajado, gastos por proyecto y rentabilidad, con un dashboard general para comparar clientes por período.

## Funcionalidad

- **Clientes** — alta, edición y baja, con modo de facturación (por hora, por proyecto o mixto).
- **Proyectos** — por cliente, con cobro por hora o precio fijo, y estado (activo, pausado, completado).
- **Registro de tiempo** — entradas manuales (fecha, horas decimales, descripción) o mediante un cronómetro en tiempo real que persiste si recargas la página. Historial editable y ordenado por fecha.
- **Gastos** — por proyecto, con fecha, para poder acotarlos a un período.
- **Rentabilidad por proyecto** — horas totales, ingreso, gastos y margen, recalculados automáticamente al agregar, editar o eliminar entradas.
- **Dashboard general** — tabla comparativa de todos los clientes (horas, ingreso y margen) filtrable por rango de fechas (este mes, mes pasado, este año o personalizado), con alertas visuales para clientes con muchas horas invertidas y bajo margen, o con pérdida.

## Stack

- **Backend:** Node.js + Express
- **Base de datos:** SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)), archivo en `data/tracker.db`
- **Frontend:** HTML, CSS y JavaScript vanilla (sin frameworks), servido como archivos estáticos desde `public/`
- **Gestor de paquetes:** [bun](https://bun.sh)

## Estructura del proyecto

```
server.js          Servidor Express y endpoints de la API REST
db/schema.sql       Definición de las tablas
db/init.js          Inicializa la base de datos (crea tablas y migra si hace falta)
data/tracker.db      Archivo SQLite (se genera al correr el proyecto, no se versiona)
public/              Frontend estático (index.html, style.css, app.js)
```

## Requisitos

- [Bun](https://bun.sh) para instalar dependencias
- [Node.js](https://nodejs.org) (18+) para ejecutar el servidor

> `better-sqlite3` usa un binding nativo que el runtime de Bun aún no soporta ([bun#4290](https://github.com/oven-sh/bun/issues/4290)), por eso las dependencias se instalan con `bun install` pero el servidor se ejecuta con `node`.

## Cómo ejecutarlo

```bash
# Instalar dependencias
bun install

# Iniciar el servidor
bun run start
# equivalente a: node server.js
```

La base de datos SQLite se crea automáticamente en `data/tracker.db` la primera vez que se levanta el servidor (o se migra si ya existe de una versión anterior del esquema).

Luego abrí [http://localhost:3000](http://localhost:3000) en el navegador.

Para desarrollo, con reinicio automático al guardar cambios:

```bash
bun run dev
# equivalente a: node --watch server.js
```

El puerto por defecto es `3000`; se puede cambiar con la variable de entorno `PORT`.

## API

Todos los endpoints devuelven y reciben JSON.

| Recurso | Endpoints |
|---|---|
| Clientes | `GET/POST /api/clientes`, `GET/PUT/DELETE /api/clientes/:id` |
| Proyectos | `GET/POST /api/proyectos` (admite `?cliente_id=`), `GET/PUT/DELETE /api/proyectos/:id` |
| Rentabilidad | `GET /api/proyectos/:id/rentabilidad` |
| Entradas de tiempo | `GET/POST /api/entradas-tiempo` (admite `?proyecto_id=`), `GET/PUT/DELETE /api/entradas-tiempo/:id` |
| Gastos | `GET/POST /api/gastos` (admite `?proyecto_id=`), `GET/PUT/DELETE /api/gastos/:id` |
| Dashboard | `GET /api/dashboard?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` |
