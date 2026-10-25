# Test Strategy — Ella API E-Commerce Backend

**Project:** Ella API (NestJS + PostgreSQL + TypeORM)
**Modules:** Users, Products, Transactions
**Author:** Bekalu Eshete
**Date:** October 2026

---

## 1. Objective

Provide a structured, risk-based approach to testing the Ella API so that
critical business flows are verified, regressions are caught early, and
deployment risk is minimised. The strategy covers four test levels — Unit,
API/Integration, E2E, and Performance — plus environment strategy and
deployment risk mitigation.

## 2. Scope

| In Scope | Out of Scope |
|---|---|
| REST API endpoints for Users, Products, Transactions | Frontend / UI testing |
| Input validation and error handling | Penetration / security audit |
| Data integrity (stock levels, unique constraints) | Infrastructure provisioning |
| Performance and load characteristics of key endpoints | Mobile or browser compatibility |
| CI/CD pipeline quality gates | Third-party payment gateway integration |

## 3. Test Levels

### 3.1 Unit Tests

| Aspect | Detail |
|---|---|
| **Goal** | Verify isolated business logic in services and DTOs. |
| **Tooling** | Jest (already configured) + `ts-jest`. Mock TypeORM repositories with `jest.mock`. |
| **Coverage target** | ≥ 80% line coverage on service layer; 100% on critical branches (stock decrement, duplicate-email handling). |
| **What to mock** | Repository calls (`findOne`, `save`, `preload`). Do not hit a real database. |
| **Key scenarios** | Transaction stock decrement logic, duplicate email handling, product update field mapping, not-found cases, validation failures. |

### 3.2 API / Integration Tests

| Aspect | Detail |
|---|---|
| **Goal** | Verify that HTTP endpoints return correct status codes, payloads, and headers against a real database schema. |
| **Tooling** | Supertest + Jest + NestJS Testing module (`Test.createTestingModule`). Use a test PostgreSQL instance (Docker or in-memory via `pg-mem`). |
| **Approach** | Spin up the NestJS app with a test database; seed initial data; run request assertions. Clean tables between test suites. |
| **Key scenarios** | CRUD for each module, validation errors (400), not-found errors (404), conflict errors (409), the full purchase flow (create user → create product → create transaction). |

### 3.3 End-to-End (E2E) Tests

| Aspect | Detail |
|---|---|
| **Goal** | Verify critical user journeys work across module boundaries with a running server instance. |
| **Tooling** | Supertest against a fully bootstrapped NestJS application (same instance the CI uses). |
| **Critical flow** | `POST /users` → `POST /products` → `POST /transactions` → `GET /transactions/:id` (verify linked user + product and updated stock). |
| **Data management** | Each E2E test creates its own data and cleans up via direct repository access or a teardown hook. Tests must not depend on execution order. |

### 3.4 Performance & Load Tests

| Aspect | Detail |
|---|---|
| **Goal** | Establish baseline latency and throughput for critical read/write endpoints; detect regressions and resource bottlenecks. |
| **Tooling** | k6 (JavaScript-based, lightweight, CI-friendly). |
| **Key endpoints** | `GET /products` (read-heavy), `POST /transactions` (write-heavy with DB writes + stock updates). |
| **Test types** | Smoke (1 VU, 30s), Load (ramp 10→50 VUs over 3 min), Stress (ramp to 200 VUs until break). |
| **SLOs (baseline targets)** | p95 latency < 200 ms for reads, < 500 ms for writes; error rate < 1%. |

## 4. Tooling Summary

| Concern | Tool | Rationale |
|---|---|---|
| Unit & API tests | Jest + Supertest | Already in `package.json`; native NestJS support; fast feedback. |
| E2E orchestration | Jest + Supertest (NestJS `Test`) | No extra runtime needed; reuses existing test config. |
| Performance | k6 | Scriptable in JS, CI-friendly, detailed metrics output. |
| API exploration | Swagger UI (`/api`) + Postman | Swagger for live docs; Postman for manual exploration and collection export. |
| Coverage | `jest --coverage` | Built into Jest; report consumed by CI gate. |
| Linting | ESLint + Prettier | Already configured; enforced in CI. |

## 5. Environment Strategy

| Environment | Database | Purpose | Data |
|---|---|---|---|
| **Development** | Local Docker PostgreSQL (`docker-compose.dev.yml`) | Day-to-day coding; `synchronize` can be toggled on for rapid iteration | Synthetic seed data |
| **Testing (CI)** | Fresh Docker PostgreSQL or `pg-mem` | Runs unit + API + E2E tests on every push/PR | Empty; seeded per test, torn down after |
| **Staging** | Cloud-managed PostgreSQL (separate instance) | Pre-production validation; mirror of prod config | Anonymised prod-like data |
| **Production** | Cloud-managed PostgreSQL (HA) | Live traffic | Real customer data |

**Key principle:** Tests never touch production data. The testing
environment is ephemeral — it is created before the test suite runs and
destroyed after, guaranteeing isolation and reproducibility.

## 6. Deployment Risk Mitigation

| Risk | Mitigation |
|---|---|
| **Bad code reaches production** | CI quality gate: lint + build + unit tests must pass before merge. API/E2E tests run on the built artifact. |
| **Database schema drift** | Migrations are version-controlled and run as a CI step against a throwaway DB. `synchronize: false` in all non-dev environments. |
| **Regression in critical flows** | E2E test for purchase flow runs on every PR. Performance regression checks run nightly. |
| **Config / secret leakage** | `.env` is gitignored; secrets injected via CI secrets or a vault. Docker image never bakes secrets in. |
| **Downtime during deploy** | Blue-green or rolling deployment; health-check endpoint gates traffic routing. |
| **Failed deploy / bad migration** | Automated rollback to previous image tag; migrations are reversible (`migration:revert` script exists). |
| **Silent failures** | Structured logging (pino/winston) + health-check endpoint + alerting on error-rate spikes. |

## 7. Test Pyramid Application

```
        /\
       /  \        E2E (few, critical flows only)
      /----\
     /      \      API / Integration (module-level, broader)
    /--------\
   /          \    Unit (many, fast, isolated)
  /____________\
```

- **Unit:** ~60% of test effort. Fast (< 10s), run on every save.
- **API/Integration:** ~25%. Run on every PR.
- **E2E:** ~10%. Critical purchase flow + key edge cases.
- **Performance:** ~5%. Nightly and pre-release.

## 8. Entry & Exit Criteria

**Entry (test phase begins when):**
- Code is committed and builds locally.
- Test database is reachable.

**Exit (test phase ends when):**
- All unit tests pass with ≥ 80% coverage.
- All API and E2E tests pass.
- No open Critical or High severity bugs.
- Performance baselines are within SLO targets.

## 9. Assumptions & Limitations

- No authentication/authorization layer exists in the current API; when added, token handling tests must be introduced.
- No payment gateway integration is present; transaction creation is simplified to stock management.
- Performance baselines are estimates; real numbers require running against the target infrastructure.
- The API does not currently have a health-check endpoint; adding one is recommended (see DevOps section).
