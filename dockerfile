# syntax=docker/dockerfile:1

# --- Etapa 1: instalar dependencias y compilar el frontend (Vite/React) ---
FROM node:22-bookworm-slim AS build

# python3/make/g++ son necesarios para compilar better-sqlite3 (módulo nativo)
# si no hay un binario prebuilt disponible para la plataforma del build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Etapa 2: imagen final, solo lo necesario para correr el servidor ---
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY package.json server.js ./
COPY db ./db

# data/ contiene la base SQLite; se monta como volumen para persistir entre
# reconstrucciones de la imagen.
RUN mkdir -p data
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
