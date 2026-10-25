# Ella API — QA/DevOps Assessment Submission

**Candidate:** Bekalu Eshete
**Date:** October 2026
**Repository:** https://github.com/ellatech-eth/QA-Assessment

---

## Summary

This submission covers both the QA and DevOps tracks for the Ella API
(NestJS + PostgreSQL e-commerce backend). I cloned the repository,
installed dependencies, built the project, and performed a thorough
static code review to identify bugs. I then wrote unit tests that
document the bugs, an automated API testing framework with E2E tests,
a performance test script, a CI/CD pipeline, and full DevOps
documentation.

### Verification Status

| Step | Command | Result |
|---|---|---|
| Install dependencies | `npm install --legacy-peer-deps` | Pass |
| Build | `npm run build` | Pass (exit 0) |
| Lint | `npx eslint "src/**/*.ts"` | Pass (0 errors, 1 warning from original code) |
| Unit tests | `npx jest --testPathPattern "src.*\.spec\.ts$"` | 27 passed, 3 suites |

> Docker was not available on the assessment machine. E2E/API tests
> were written but require a running API + database to execute. The
> unit tests run without a database and all pass.

---

## Submission Structure

```
qa/
  test-strategy.md                          # High-level test strategy (1-2 pages)
  BUGS.md                                   # 9 bug reports with root cause analysis
  code-review-guidelines.md                  # Standards for reviewing test code
  performance-test.js                        # k6 performance test script
  automation-framework/
    README.md                                # Framework docs & run instructions
    jest.config.js                           # Jest config for E2E tests
    test/
      helpers/
        api-client.ts                        # Centralised HTTP request helpers
        test-data.ts                         # Test data factory functions
      e2e-purchase-flow.e2e-spec.ts          # Critical user flow E2E test
      users.api.e2e-spec.ts                  # Users module API tests
      products.api.e2e-spec.ts               # Products module API tests
      transactions.api.e2e-spec.ts            # Transactions module API tests

devops/
  ci-notes.md                                # CI/CD pipeline notes + CD extension plan
  environment-notes.md                      # Env vars for dev/staging/testing/prod
  docker-troubleshooting.md                  # Docker build issues & fixes
  deployment-runbook.md                      # Build, deploy, rollback guide
  cloud-deployment-plan.md                   # AWS deployment overview (bonus)

src/
  health/
    health.controller.ts                     # GET /health endpoint (added)
    health.module.ts                         # Health module (added)
  users/users.service.spec.ts                # Unit tests (8 tests)
  products/products.service.spec.ts          # Unit tests (7 tests)
  transactions/transactions.service.spec.ts  # Unit tests (12 tests)

.github/
  workflows/
    ci.yml                                   # GitHub Actions CI pipeline

eslint.config.mjs                            # Updated with test-file overrides
README-SUBMISSION.md                         # This file
```

---

## QA Track

### 1. Test Strategy
See `qa/test-strategy.md`. Covers four test levels (Unit, API, E2E,
Performance), tooling choices (Jest + Supertest + k6), environment
strategy (dev, test, staging, prod), deployment risk mitigation, and
the test pyramid application.

### 2. Test Automation Architecture
See `qa/automation-framework/`. Built with **Supertest + Jest** (both
already in the project's devDependencies). The framework includes:
- A centralised API client (`helpers/api-client.ts`) for all HTTP requests
- Test data factories (`helpers/test-data.ts`) that generate unique emails
  and product names to avoid collisions
- E2E test for the critical flow: user creation → product creation →
  transaction creation → verification of linked data and stock updates
- Per-module API test suites covering CRUD, validation, and error cases

### 3. Exploratory Testing & Bug Reporting
See `qa/BUGS.md`. Found 9 bugs through static code review:

| # | Bug | Severity |
|---|---|---|
| BUG-001 | Duplicate email returns fake 201 (not 409) | Critical |
| BUG-002 | Transaction increases stock instead of decreasing | Critical |
| BUG-003 | Product update sets price to quantity value | High |
| BUG-004 | No email format validation | Medium |
| BUG-005 | OUT_OF_STOCK products can be purchased | High |
| BUG-006 | Out-of-stock status never set (dead code) | High |
| BUG-007 | Migrations path mismatch in Docker | Medium |
| BUG-008 | Production Docker installs devDependencies | Medium |
| BUG-009 | Dockerfile bakes .env into image | Medium |

Each report includes title, severity, steps to reproduce, expected vs
actual result, root cause analysis with file/line references, and
suggested fixes.

### 4. Performance & Load Testing
See `qa/performance-test.js`. A k6 script that load-tests
`POST /transactions` (the critical write path). Includes:
- Smoke test configuration (configurable for load/stress)
- Custom metrics (error rate, latency trend)
- SLO thresholds (p95 < 500ms, error rate < 1%)
- JSON summary output for CI integration

### 5. Code Review & Mentorship
See `qa/code-review-guidelines.md`. Includes a 21-point review
checklist covering structure, isolation, assertions, mocking,
coverage, and performance. Includes a mock PR review example showing
how I would review a junior QA engineer's test submission.

---

## DevOps Track

### 1. CI/CD Pipeline
See `.github/workflows/ci.yml` and `devops/ci-notes.md`. The pipeline:
- Triggers on push and PR to main/master/develop
- Provisions a PostgreSQL 16 service container
- Runs: install → lint → build → unit tests (with coverage)
- Fails on any step failure
- Uploads coverage report as an artifact

The notes document a 3-stage path toward continuous deployment: add
integration tests → build & push Docker image → deploy to cloud.

### 2. Containerization & Build Troubleshooting
See `devops/docker-troubleshooting.md`. Documents 6 issues found in
the Dockerfile and docker-compose files:
1. Migrations path mismatch (prevents auto-schema creation in Docker)
2. Production stage installs devDependencies
3. `.env` baked into the image (secret leakage)
4. Redundant typeorm install
5. Deprecated `version` field in docker-compose.dev.yml
6. Redundant compose command override

Each issue includes diagnosis, fix, and an improved Dockerfile.

### 3. Environment Configuration
See `devops/environment-notes.md`. Documents all 6 environment
variables and provides configuration profiles for development,
testing, staging, and production. Includes a comparison table showing
what changes between environments.

### 4. Health Checks & Monitoring
Added `GET /health` endpoint in `src/health/`. Returns 200 with DB
connection status when healthy, 503 with error details when the
database is unreachable. Registered in `app.module.ts` via
`HealthModule`.

### 5. Deployment Runbook
See `devops/deployment-runbook.md`. Covers build, deploy (local +
cloud), rollback procedures, and a 10-row common failures table with
diagnoses and fixes.

### 6. Cloud Deployment Plan (Bonus)
See `devops/cloud-deployment-plan.md`. Beginner-friendly AWS
deployment plan using ECS Fargate + RDS PostgreSQL + ALB. Includes
architecture diagram, step-by-step deployment, cost estimates, and
alternative platform recommendations (GCP Cloud Run, Azure, Railway).

---

## Assumptions

1. No authentication/authorization exists in the API — tests do not
   handle tokens. When auth is added, the framework should be extended
   with a token helper.
2. No payment gateway — "transactions" are simplified stock movements.
3. Docker was not available on the assessment machine — E2E tests and
   Docker troubleshooting are based on code analysis and are designed
   to work against a correctly configured instance.
4. Performance test results are estimates — real metrics require
   running k6 against the deployed infrastructure.

## Limitations

- E2E/API tests could not be executed without Docker (for the
  PostgreSQL database). The unit tests (27 total) all pass and cover
  the service-layer logic including all documented bugs.
- Performance test results are not included — the k6 script is ready
  to run but requires a live API instance.
- No Postman collection exported — the API client helpers in the
  automation framework serve the same purpose and are version-controlled.

## Suggested Improvements (With More Time)

1. Set up Docker and run the full E2E test suite to verify the
   automated tests pass against the live API.
2. Execute the k6 performance test and include baseline metrics.
3. Fix the 9 documented bugs and re-run tests to confirm they now
   assert the expected (correct) behavior.
4. Add integration tests using `pg-mem` or a Docker test database in
   CI so E2E tests run on every PR.
5. Add pagination to list endpoints (`GET /users`, `GET /products`).
6. Add authentication middleware and token-based test helpers.
7. Export a Postman collection from the API client helpers for
   manual testing convenience.
8. Add structured logging (pino or winston) for production observability.

---

## How to Run

```bash
# 1. Clone and install
git clone https://github.com/ellatech-eth/QA-Assessment.git
cd QA-Assessment
npm install --legacy-peer-deps

# 2. Copy env
cp .env.example .env

# 3. Start database (requires Docker)
docker compose -f docker-compose.dev.yml up -d

# 4. Run migrations
npm run migration:generate
npm run migration:run

# 5. Start the API
npm run start:dev

# 6. Run unit tests (no server needed)
npm test

# 7. Run E2E tests (requires running server)
npx jest --config qa/automation-framework/jest.config.js

# 8. Run performance tests (requires running server + k6)
k6 run qa/performance-test.js

# 9. Build the project
npm run build

# 10. Lint
npm run lint
```
