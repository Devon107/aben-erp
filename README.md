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
- **Base de datos:** SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)), archivo en `data/tracker.db` (montos guardados en centavos como `INTEGER`)
- **Frontend:** React + Vite, código fuente en `client/`, compilado a `public/` (que Express sirve como estático)
- **Gestor de paquetes:** [bun](https://bun.sh)

## Estructura del proyecto

```
server.js            Servidor Express y endpoints de la API REST (exporta createApp(db) para tests)
db/schema.sql         Definición de las tablas
db/init.js            Inicializa la base de datos (crea tablas y migra si hace falta)
data/tracker.db        Archivo SQLite (se genera al correr el proyecto, no se versiona)
client/                Código fuente de React (Vite). client/src/lib, components, views, features/proyectos
public/                 Build de producción (generado por `vite build`, no se versiona)
test/                   Tests con el runner nativo de Node (node --test)
```

## Requisitos

- [Bun](https://bun.sh) para instalar dependencias
- [Node.js](https://nodejs.org) (18+) para ejecutar el servidor

> `better-sqlite3` usa un binding nativo que el runtime de Bun aún no soporta ([bun#4290](https://github.com/oven-sh/bun/issues/4290)), por eso las dependencias se instalan con `bun install` pero el servidor se ejecuta con `node`.

## Cómo ejecutarlo

```bash
# Instalar dependencias
bun install

# Compilar el frontend (genera public/)
bun run build

# Iniciar el servidor
bun run start
# equivalente a: node server.js
```

La base de datos SQLite se crea automáticamente en `data/tracker.db` la primera vez que se levanta el servidor (o se migra si ya existe de una versión anterior del esquema).

Luego abrí [http://localhost:3000](http://localhost:3000) en el navegador.

Para desarrollo, con recarga en caliente del frontend (Vite en `:5173`, con proxy de `/api` hacia Express en `:3000`) y reinicio automático del backend:

```bash
bun run dev
# corre en paralelo: node --watch server.js (dev:server) y vite (dev:client)
```

En desarrollo abrí [http://localhost:5173](http://localhost:5173) (no `:3000`, que en ese modo solo sirve la API). El puerto del backend por defecto es `3000`; se puede cambiar con la variable de entorno `PORT`.

## Tests

```bash
bun run test
# equivalente a: node --test
```

Corre tests de backend (contra una base SQLite temporal, nunca `data/tracker.db`) y de la lógica pura del frontend (`client/src/lib/logic.js`).

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
