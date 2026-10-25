# Environment Configuration Notes

**Author:** Bekalu Eshete
**Source:** `.env.example`

---

## 1. Environment Variables Reference

The application reads the following environment variables. They are
consumed by `src/app.module.ts` (TypeORM connection), `data-source.ts`
(TypeORM CLI for migrations), and `docker-compose.yml`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `4000` | Port the NestJS HTTP server listens on. |
| `DB_HOST` | Yes | `localhost` | PostgreSQL host. Use `localhost` for local dev; `db` inside Docker Compose. |
| `DB_PORT` | Yes | `5432` | PostgreSQL port. |
| `DB_USERNAME` | Yes | `postgres` | Database username. |
| `DB_PASSWORD` | Yes | `postgres` | Database password. **Must be changed in staging/prod.** |
| `DB_DATABASE` | Yes | `ella` | Database name. |

---

## 2. Environment Profiles

### 2.1 Development (`.env` or `.env.development`)

```env
# Application
PORT=4000

# Database — local Docker PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=ella
```

**Characteristics:**
- Uses `docker-compose.dev.yml` to start only the database.
- The application runs locally via `npm run start:dev` (hot reload).
- `synchronize` is set to `false` in `app.module.ts`; use
  `npm run migration:generate` + `npm run migration:run` for schema
  changes.
- Weak/default credentials are acceptable for local development.

### 2.2 Testing (`.env.test`)

```env
# Application
PORT=4001

# Database — ephemeral test database (CI or local test container)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=ella_test
```

**Characteristics:**
- Database is created fresh before each test run and dropped after.
- In CI, GitHub Actions provisions a PostgreSQL service container
  (see `.github/workflows/ci.yml`).
- Port is set to 4001 to avoid conflicts with a running dev instance.
- No hot reload — tests run against the built or compiled code.
- Migrations must run before tests: `npm run migration:run`.
- Tests must not depend on pre-existing data; each test seeds and
  cleans up its own records.

### 2.3 Staging (`.env.staging`)

```env
# Application
PORT=4000

# Database — cloud-managed PostgreSQL (e.g., AWS RDS)
DB_HOST=ella-staging-db.xxxxxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_USERNAME=ella_app_staging
DB_PASSWORD=<secure-random-password-from-secrets-manager>
DB_DATABASE=ella_staging
```

**Characteristics:**
- Database is a separate cloud-managed instance (not shared with prod).
- Credentials are injected at runtime via the cloud platform's secrets
  manager (AWS Secrets Manager, Azure Key Vault, etc.) — **never** baked
  into the Docker image or committed to Git.
- `synchronize: false` — schema changes only via migrations.
- `migrationsRun: true` — migrations run automatically on application
  startup.
- The `.env` file is NOT copied into the Docker image (see BUGS.md
  BUG-009). Environment variables are passed via `docker-compose.yml`
  `environment:` block or container orchestration (ECS, K8s).

### 2.4 Production (`.env.production`)

```env
# Application
PORT=4000

# Database — cloud-managed PostgreSQL with HA (multi-AZ)
DB_HOST=ella-prod-db.xxxxxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_USERNAME=ella_app_prod
DB_PASSWORD=<secure-random-password-from-secrets-manager>
DB_DATABASE=ella_prod
```

**Characteristics:**
- Database is a multi-AZ, managed PostgreSQL instance with automated
  backups and point-in-time recovery.
- Strong, unique passwords stored in a secrets manager — not in any
  file.
- `synchronize: false`, `migrationsRun: true`.
- Connection pooling via PgBouncer or the managed database's pool
  settings.
- Database access restricted by security groups / firewall rules to
  only the application's network.

---

## 3. What Changes Between Environments

| Aspect | Development | Testing | Staging | Production |
|---|---|---|---|---|
| DB_HOST | `localhost` | `localhost` (CI container) | Cloud RDS | Cloud RDS (HA) |
| DB_DATABASE | `ella` | `ella_test` | `ella_staging` | `ella_prod` |
| DB_PASSWORD | `postgres` (weak) | `postgres` (weak) | Strong (secrets) | Strong (secrets) |
| PORT | 4000 | 4001 | 4000 | 4000 |
| Migrations | Manual | Auto (before tests) | Auto on startup | Auto on startup |
| Hot reload | Yes (`start:dev`) | No | No | No |
| Debug logs | Verbose | Minimal | Structured (warn+) | Structured (error+) |
| Secrets in image | N/A | N/A | Injected at runtime | Injected at runtime |
| DB backups | None | None (ephemeral) | Daily | Continuous PITR |

---

## 4. How to Manage Environment Files

```
.env.example     ← committed to Git (template, no secrets)
.env             ← gitignored, local dev only
.env.test        ← gitignored, CI injects via GitHub Actions env
.env.staging     ← NEVER committed; managed by cloud platform
.env.production  ← NEVER committed; managed by cloud platform
```

**Key rules:**
1. `.env` is in `.gitignore` — it must never be committed.
2. Only `.env.example` is committed; it contains placeholder values.
3. In CI/CD, environment variables are set in the pipeline configuration
   or pulled from a secrets manager at deploy time.
4. The Dockerfile must NOT `COPY .env ./` (see BUGS.md BUG-009).
