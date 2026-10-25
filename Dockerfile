# --- Builder stage ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

# Prune devDependencies so only production deps are copied to final image
RUN npm prune --omit=dev

# --- Production stage ---
FROM node:20-alpine
WORKDIR /app

# Fix BUG-008: copy only production node_modules from builder (no devDeps)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./

# Fix BUG-009: do NOT copy .env — injected at runtime via docker-compose env_file
# COPY .env ./  <-- intentionally removed

EXPOSE 4000
CMD ["node", "dist/src/main.js"]
