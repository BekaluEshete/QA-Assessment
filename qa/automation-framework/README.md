# Automation Test Framework — Ella API

**Tool:** Supertest + Jest
**Author:** Bekalu Eshete

---

## Overview

This directory contains the automated API testing framework for the
Ella API. It uses **Supertest** (HTTP assertions) combined with **Jest**
(test runner) to exercise the REST API endpoints.

The framework covers three layers:
- **Unit tests** (in `src/**/*.spec.ts`) — service-level logic with mocked repositories
- **API/E2E tests** (in this directory) — HTTP-level tests against a running server
- **E2E purchase flow** — the critical user journey: create user → create product → create transaction → verify

---

## Prerequisites

1. Node.js 20+
2. npm dependencies installed (`npm install --legacy-peer-deps` in project root)
3. The Ella API running locally at `http://localhost:4000`
   - Start the database: `docker compose -f docker-compose.dev.yml up -d`
   - Run migrations: `npm run migration:generate && npm run migration:run`
   - Start the app: `npm run start:dev`

---

## Directory Structure

```
qa/automation-framework/
├── jest.config.js              # Jest configuration for E2E/API tests
├── README.md                    # This file
└── test/
    ├── helpers/
    │   ├── api-client.ts        # Centralised HTTP request helpers
    │   └── test-data.ts          # Test data factory functions (unique emails, products)
    ├── e2e-purchase-flow.e2e-spec.ts   # Critical user flow: user → product → transaction
    ├── users.api.e2e-spec.ts           # Users module API tests
    ├── products.api.e2e-spec.ts        # Products module API tests
    └── transactions.api.e2e-spec.ts    # Transactions module API tests
```

---

## Running Tests

### Unit Tests (no running server needed)

```bash
# From the project root:
npm test

# Or specifically:
npx jest --testPathPattern "src.*\.spec\.ts$"
```

### E2E / API Tests (requires running server)

```bash
# All E2E tests:
npx jest --config qa/automation-framework/jest.config.js

# Specific module:
npx jest --config qa/automation-framework/jest.config.js --testPathPattern users.api
npx jest --config qa/automation-framework/jest.config.js --testPathPattern products.api
npx jest --config qa/automation-framework/jest.config.js --testPathPattern transactions.api

# Critical purchase flow only:
npx jest --config qa/automation-framework/jest.config.js --testPathPattern e2e-purchase-flow
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `API_URL` | `http://localhost:4000` | Base URL for API requests |
| `USER_ID` | `1` | Default user ID for performance tests |
| `PRODUCT_ID` | `1` | Default product ID for performance tests |

---

## Test Coverage

### Unit Tests (`src/`)

| Module | Spec File | Tests | Key Coverage |
|---|---|---|---|
| UsersService | `src/users/users.service.spec.ts` | 8 | CRUD, BUG-001 (fake 201 on duplicate email) |
| ProductsService | `src/products/products.service.spec.ts` | 7 | CRUD, BUG-003 (price set to quantity on update) |
| TransactionsService | `src/transactions/transactions.service.spec.ts` | 9 | CRUD, BUG-002 (stock increment), BUG-005 (out-of-stock), BUG-006 (dead code) |

### E2E / API Tests

| Suite | Spec File | Key Scenarios |
|---|---|---|
| Purchase Flow | `e2e-purchase-flow.e2e-spec.ts` | Full purchase journey + error cases (404, 409, 400) |
| Users API | `users.api.e2e-spec.ts` | CRUD, validation, duplicate email bug |
| Products API | `products.api.e2e-spec.ts` | CRUD, validation, price-mapping bug |
| Transactions API | `transactions.api.e2e-spec.ts` | CRUD, stock check, stock update behavior |

---

## Design Patterns

- **API Client Pattern:** All HTTP requests are centralised in
  `helpers/api-client.ts` so test specs stay focused on assertions.
- **Test Data Factories:** `helpers/test-data.ts` generates unique
  emails and product names using timestamps + counters, preventing
  collisions when tests run in parallel.
- **AAA Pattern:** Every test follows Arrange → Act → Assert with clear
  separation and descriptive names.
- **Bug Documentation:** Tests that document known bugs are prefixed
  with `BUG-XXX:` and assert the **actual** (buggy) behavior with
  comments explaining what the expected behavior should be.

---

## Known Issues

- E2E tests require a running API with a database (Docker + migrations).
- Docker was not available on the assessment machine, so E2E tests
  were written but could not be executed. They are designed to pass
  against a correctly configured running instance.
- Unit tests pass and cover the service-layer bugs documented in
  `BUGS.md`.
