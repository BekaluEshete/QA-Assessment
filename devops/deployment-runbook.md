# Deployment Runbook — Ella API

**Author:** Bekalu Eshete
**Service:** Ella API (NestJS + PostgreSQL)
**Last updated:** October 2026

---

## 1. Overview

This runbook covers building, deploying, rolling back, and
troubleshooting the Ella API service. It is intended for on-call
engineers and DevOps team members.

---

## 2. Prerequisites

- Docker and Docker Compose installed
- Node.js 20+ (for local/migration runs)
- Access to the container registry (e.g., GHCR, ECR)
- Access to the cloud platform console (if deploying to cloud)
- Database credentials (from secrets manager — never in plaintext files)

---

## 3. Build

### 3.1 Local Build (for testing)

```bash
# Install dependencies
npm install --legacy-peer-deps

# Compile TypeScript
npm run build

# Output is in dist/
```

### 3.2 Docker Build

```bash
# Build the image (fixes to Dockerfile recommended — see BUGS.md)
docker compose -f docker-compose.yml build

# Or build standalone
docker build -t ella-api:latest .
```

### 3.3 CI Build (GitHub Actions)

The CI pipeline (`.github/workflows/ci.yml`) automatically builds on
every push and PR. On merge to `main`, the Docker image is built and
pushed to the container registry (see `ci-notes.md` for the extended
pipeline).

---

## 4. Deploy

### 4.1 Local Deployment (Docker Compose)

```bash
# 1. Copy and configure environment
cp .env.example .env
# Edit .env with appropriate values

# 2. Build and start the full stack (app + db)
docker compose up -d --build

# 3. Verify the API is up
curl http://localhost:4000/health
# Expected: {"status":"ok","database":"connected",...}

# 4. Check Swagger docs
# Open http://localhost:4000/api in a browser
```

### 4.2 Staging Deployment (Cloud — Example: AWS ECS)

```bash
# 1. Ensure the latest image is in the registry
docker pull ghcr.io/ellatech-eth/qa-assessment:latest

# 2. Update the ECS service to pull the new image
aws ecs update-service \
  --cluster ella-staging \
  --service ella-api-staging \
  --force-new-deployment

# 3. Wait for the service to stabilize
aws ecs wait services-stable \
  --cluster ella-staging \
  --services ella-api-staging

# 4. Verify health
curl https://staging.ella-api.example.com/health
```

### 4.3 Production Deployment

Same as staging, but:
1. Requires manual approval (GitHub Environment protection rule).
2. Use blue-green deployment: deploy to a new target group, verify
   health, then switch the load balancer.
3. Monitor error rates for 10 minutes after cutover.

---

## 5. Rollback

### 5.1 Docker Compose Rollback

```bash
# 1. Stop the current stack
docker compose down

# 2. Revert to the previous image tag
docker compose pull ella-api:previous-tag
# Update docker-compose.yml to reference the previous tag, then:
docker compose up -d

# 3. Revert database migration if needed
npm run migration:revert
```

### 5.2 Cloud Rollback (AWS ECS)

```bash
# 1. Re-deploy the previous task definition (identified by image tag)
aws ecs update-service \
  --cluster ella-prod \
  --service ella-api-prod \
  --task-definition ella-api-prod:PREVIOUS_REVISION

# 2. Wait for stabilization
aws ecs wait services-stable \
  --cluster ella-prod \
  --services ella-api-prod

# 3. If a bad migration was applied, revert it
npm run migration:revert

# 4. Verify health
curl https://api.ella.example.com/health
```

### 5.3 Database Rollback Notes

- Always test `migration:revert` in staging before applying in prod.
- If the migration is destructive (drops columns), restoring from a
  backup may be the only option — always take a backup before
  deploying migrations to prod.

---

## 6. Common Failures & Fixes

| # | Symptom | Likely Cause | Fix |
|---|---|---|---|
| 1 | `ECONNREFUSED 127.0.0.1:5432` on startup | Database not running | `docker compose -f docker-compose.dev.yml up -d` to start DB |
| 2 | `relation does not exist` on API call | Migrations didn't run | `npm run migration:generate && npm run migration:run` (see BUGS.md BUG-007 for path mismatch) |
| 3 | `password authentication failed` | Wrong DB credentials | Verify `DB_PASSWORD` in `.env` matches the PostgreSQL container |
| 4 | Port 4000 already in use | Another process on 4000 | `lsof -i :4000` (Linux) or `netstat -ano \| findstr :4000` (Windows); kill the process or change `PORT` |
| 5 | Docker build fails on `npm install` | Peer dependency conflicts | Use `--legacy-peer-deps` flag (already in Dockerfile) |
| 6 | Container starts but health check fails | DB not ready yet | The `depends_on: condition: service_healthy` in docker-compose.yml handles this; ensure the healthcheck is configured |
| 7 | Duplicate product name error on create | Unique constraint on `name` column | This is expected behavior — product names must be unique |
| 8 | API returns 500 on POST /users with duplicate email | See BUG-001 in BUGS.md | The API returns 201 with a fake user — fix needed in `users.service.ts` |
| 9 | Product price changes after update | See BUG-003 in BUGS.md | `product.price = dto.quantity` should be `dto.price` in `products.service.ts` |
| 10 | Stock increases after purchase | See BUG-002 in BUGS.md | `product.quantity += dto.quantity` should be `-=` in `transactions.service.ts` |

---

## 7. Monitoring Checklist

After every deployment, verify:

- [ ] `GET /health` returns 200 with `status: ok`
- [ ] Swagger UI is accessible at `/api`
- [ ] No 5xx errors in application logs for the first 10 minutes
- [ ] Database connection pool is not exhausted
- [ ] CPU and memory usage are within normal bounds
- [ ] Response latency (p95) is within SLO (< 500ms for writes, < 200ms for reads)

---

## 8. Contacts

| Role | Contact |
|---|---|
| On-call engineer | (configured in PagerDuty) |
| DBA | (configured in escalation policy) |
| QA Lead | Bekalu Eshete |
