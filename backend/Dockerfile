FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=tmpfs,target=/root/.npm npm ci --workspaces=false --no-audit --no-fund
COPY backend ./backend
COPY tsconfig.json ./
RUN npx prisma generate --schema backend/prisma/schema.prisma && npm run build:backend
RUN npm prune --omit=dev --workspaces=false --ignore-scripts --no-audit --no-fund
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node","backend/dist/server.js"]
