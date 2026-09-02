# ---------------------------------------------------------------------------
# Trichy Vision newsroom UI - built with Vite, served by nginx
# ---------------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# The browser talks to /api on the same origin; nginx proxies it to the API,
# which keeps the session cookie same-site.
ENV VITE_API_URL=/api
RUN npm run build

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
