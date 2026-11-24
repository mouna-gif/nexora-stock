# Frontend Vite + React — Nexora Smart Stock AI
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

# ── Serveur nginx : la conf est montée par docker-compose ────
# (./docker/nginx.conf → /etc/nginx/conf.d/default.conf)
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
