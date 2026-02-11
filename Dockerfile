# ---------- build stage ----------
FROM node:22-slim AS build

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json ./

# Install all deps (including devDeps for build)
RUN npm ci

# Copy source and build
COPY tsconfig.json tsup.config.* ./
COPY src/ src/

RUN npm run build

# ---------- production stage ----------
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./

# Production deps only
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
