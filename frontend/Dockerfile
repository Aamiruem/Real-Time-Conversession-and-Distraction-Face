# React (Vite) frontend — built to static files (public pages pre-rendered for SEO) and served by nginx.
# Build context is frontend/ (docker compose does this for you). /api and /ws are routed by deploy/nginx.conf.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --no-audit --no-fund
COPY . ./
ARG VITE_SITE_URL=http://localhost
ENV VITE_SITE_URL=$VITE_SITE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
