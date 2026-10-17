# syntax=docker/dockerfile:1

# Stage 1: Build Go Compiler
FROM golang:1.23-alpine AS compiler-builder
WORKDIR /src/compiler
COPY services/compiler/go.mod ./
COPY services/compiler/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/compiler ./cmd/compiler

# Stage 2: Build Node Monorepo
FROM node:22-alpine AS node-builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY apps/ apps/
RUN pnpm install
RUN pnpm build

# Stage 3: Runtime image
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=compiler-builder /bin/compiler /usr/local/bin/compiler
COPY --from=node-builder /app/package.json ./
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/packages ./packages
COPY --from=node-builder /app/apps ./apps

USER appuser
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
