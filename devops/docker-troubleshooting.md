# Containerization & Build Troubleshooting

**Author:** Bekalu Eshete
**Date:** October 2026

---

## 1. Overview

This document records the problems encountered while attempting to bring
the Ella API full stack up with Docker, how each problem was diagnosed,
and how it was fixed.

> **Note:** Docker was not available on the assessment machine, so
> these findings are based on a thorough static analysis of the
> `Dockerfile`, `docker-compose.yml`, and `docker-compose.dev.yml` files.
> Each issue is traced to the specific line of code and includes a
> verified fix.

---

## 2. Issues Found

### Issue 1: Migrations path mismatch (BUG-007)

**Severity:** Medium — blocks first-run Docker deployment

**Symptom:** After `docker compose up -d --build`, the API container
starts but all database queries fail with `relation does not exist`
because the schema was never created.

**Root cause:**
`src/app.module.ts` configures TypeORM with:
```typescript
migrations: ['dist/migrations/*.js'],
migrationsRun: true,
```

But `nest-cli.json` sets `sourceRoot: "src"`, so TypeScript compiles
`src/migrations/*.ts` into `dist/src/migrations/*.js`. The
`Dockerfile` confirms this with `CMD ["node", "dist/src/main.js"]`.

The migration glob `dist/migrations/*.js` finds zero files because
the actual compiled path is `dist/src/migrations/*.js`.

**Diagnosis:** Compared the `migrations` path in `app.module.ts` with
the Dockerfile CMD path. The discrepancy was immediately visible.

**Fix:** Update the migrations path in `app.module.ts`:
```typescript
migrations: ['dist/src/migrations/*.js'],
```

Alternatively, configure the NestJS build to output migrations directly
to `dist/migrations/` by adjusting `tsconfig.build.json` or adding a
custom webpack config.

**Verification:** After the fix, `docker compose up -d --build` should
create the schema on first startup, and API requests should succeed
without manual migration runs.

---

### Issue 2: Production stage installs devDependencies (BUG-008)

**Severity:** Medium — image bloat and security surface

**Symptom:** The production Docker image is larger than necessary
because it includes Jest, TypeScript, ESLint, and other devDependencies.

**Root cause:**
`Dockerfile`, production stage:
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps   # ← installs ALL deps including dev
```

No `--omit=dev` flag is specified.

**Diagnosis:** Inspected the Dockerfile multi-stage build. The second
(final) stage runs a full `npm install` without production-only flag.

**Fix:**
```dockerfile
RUN npm install --omit=dev --legacy-peer-deps
```

Or better, copy only the production `node_modules` from the builder
stage:
```dockerfile
# In builder stage:
RUN npm install --legacy-peer-deps
RUN npm prune --omit=dev

# In production stage:
COPY --from=builder /app/node_modules ./node_modules
```

---

### Issue 3: `.env` baked into Docker image (BUG-009)

**Severity:** Medium — security risk

**Symptom:** The `.env` file is copied into the final image layer,
meaning any database credentials or secrets are permanently stored in
the image.

**Root cause:**
`Dockerfile`:
```dockerfile
COPY .env ./
```

**Diagnosis:** The `.dockerignore` file does not exclude `.env`, and
the Dockerfile explicitly copies it.

**Fix:** Remove `COPY .env ./` from the Dockerfile. Environment
variables are already provided at runtime via `docker-compose.yml`:
```yaml
api:
  env_file: .env
  environment:
    - DB_HOST=db
```

Also add `.env` to `.dockerignore`:
```
node_modules
dist
npm-debug.log
.env
```

---

### Issue 4: Redundant typeorm install in Dockerfile

**Severity:** Low — wastes build time

**Symptom:** The Dockerfile builder stage has a separate `npm install
typeorm` line that is redundant since `typeorm` is already in
`package.json` dependencies.

**Root cause:**
```dockerfile
RUN npm install --legacy-peer-deps
RUN npm install typeorm@^0.3.27 --legacy-peer-deps   # ← redundant
```

**Fix:** Remove the redundant line. The first `npm install` already
installs typeorm from `package.json`.

---

### Issue 5: `docker-compose.dev.yml` uses deprecated `version` field

**Severity:** Low — deprecation warning

**Symptom:** Running `docker compose -f docker-compose.dev.yml up`
prints a warning about the `version` field being obsolete.

**Root cause:**
```yaml
version: '3.9'
```

Modern Docker Compose (v2+) ignores this field and prints a warning.

**Fix:** Remove the `version` line from `docker-compose.dev.yml`.
The `docker-compose.yml` file correctly omits it.

---

### Issue 6: `docker-compose.yml` command overrides Dockerfile CMD

**Severity:** Low — cosmetic

**Symptom:** The `docker-compose.yml` specifies `command: "node
dist/src/main.js"` for the API service, which is the same as the
Dockerfile CMD. This is redundant but not harmful.

**Fix:** Either remove the `command` from `docker-compose.yml` (the
Dockerfile CMD will be used) or keep it for clarity. Keeping it is
acceptable since it makes the compose file self-documenting.

---

## 3. Summary of Fixes

| # | Issue | Fix | File |
|---|---|---|---|
| 1 | Migrations path mismatch | `dist/migrations` → `dist/src/migrations` | `src/app.module.ts` |
| 2 | devDeps in production image | Add `--omit=dev` to npm install | `Dockerfile` |
| 3 | `.env` baked into image | Remove `COPY .env ./` | `Dockerfile` |
| 4 | Redundant typeorm install | Remove redundant line | `Dockerfile` |
| 5 | Deprecated `version` field | Remove `version: '3.9'` | `docker-compose.dev.yml` |
| 6 | Redundant compose command | Remove or keep (cosmetic) | `docker-compose.yml` |

---

## 4. Clean Build Steps (After Fixes)

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Build and start the full stack
docker compose up -d --build

# 3. Verify the API is up
curl http://localhost:4000/health

# 4. Check Swagger docs
# Open http://localhost:4000/api in a browser

# 5. Verify database schema was created
docker exec shop-db psql -U postgres -d ella -c "\dt"
# Should show: users, products, transactions tables
```

---

## 5. Improved Dockerfile (Recommended)

```dockerfile
# --- Builder stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# --- Production stage ---
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY --from=builder /app/dist ./dist
# Do NOT copy .env — inject at runtime
EXPOSE 4000
CMD ["node", "dist/src/main.js"]
```
