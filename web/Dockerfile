FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Required at build — no placeholders in production image
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CONTACT_EMAIL
ARG NEXT_PUBLIC_CONTROLLER_NAME
ARG NEXT_PUBLIC_CF_BEACON=
ARG NEXT_PUBLIC_ACCENT=teal
ARG NEXT_PUBLIC_THEME=light
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL \
    NEXT_PUBLIC_CONTROLLER_NAME=$NEXT_PUBLIC_CONTROLLER_NAME \
    NEXT_PUBLIC_CF_BEACON=$NEXT_PUBLIC_CF_BEACON \
    NEXT_PUBLIC_ACCENT=$NEXT_PUBLIC_ACCENT \
    NEXT_PUBLIC_THEME=$NEXT_PUBLIC_THEME
RUN node scripts/check-env.mjs && pnpm build

FROM nginx:1.27-alpine
ENV PORT=80
# API host:port (e.g. api.railway.internal:8000). Unresolved host → /api 502; site still up (B1).
ENV API_UPSTREAM=api:8000
# Docker embedded DNS. On Railway private network set NGINX_RESOLVER=[fd12::10]
ENV NGINX_RESOLVER=127.0.0.11
COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
