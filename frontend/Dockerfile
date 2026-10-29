FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN --mount=type=tmpfs,target=/root/.npm npm ci --workspace frontend --include-workspace-root=false --no-audit --no-fund
COPY frontend ./frontend
RUN npm run build:frontend
FROM nginx:1.29-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
