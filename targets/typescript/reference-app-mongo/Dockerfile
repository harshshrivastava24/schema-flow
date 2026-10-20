FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json tsconfig.json ./
RUN pnpm install --frozen-lockfile=false

COPY src ./src
RUN pnpm run build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY package.json ./
RUN pnpm install --prod --frozen-lockfile=false

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/src/index.js"]
