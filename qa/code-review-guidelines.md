# Code Review Guidelines — Automated Test Code

**Author:** Bekalu Eshete
**Purpose:** Standards and patterns I enforce when reviewing automated test code submitted by a junior QA engineer.

---

## 1. Philosophy

Test code is production code. It must be readable, maintainable, and
deterministic. A flaky test is worse than no test — it erodes trust in the
entire suite. Reviews should catch logic errors, improve clarity, and
teach patterns, not just check boxes.

---

## 2. Review Checklist

### 2.1 Structure & Organisation

| # | Guideline | Why |
|---|---|---|
| 1 | Tests follow the **AAA pattern**: Arrange, Act, Assert — with clear separation (blank lines or comments). | Readability; a new team member should understand the scenario in 5 seconds. |
| 2 | Each test file maps to one module or feature under test (e.g., `users.service.spec.ts` → `UsersService`). | Navigation; when a service changes, you know exactly which test file to update. |
| 3 | Shared setup lives in `beforeEach` / `afterEach`, not duplicated across tests. | DRY; if the setup changes, you update one place. |
| 4 | Test names are descriptive sentences: `it('should return 409 when email already exists', ...)`. | The failure output should read like a spec. `it('test1')` is rejected. |

### 2.2 Isolation & Determinism

| # | Guideline | Why |
|---|---|---|
| 5 | No test depends on another test's execution order or side effects. | Tests must be independently runnable. |
| 6 | External state (database rows, files) is cleaned up in `afterEach` or `afterAll`. | Prevents cross-test contamination. |
| 7 | No hardcoded timestamps, random values, or `Date.now()` without freezing the clock. | Non-deterministic tests are flaky. Use `jest.useFakeTimers()` or inject a fixed date. |
| 8 | No network calls to external services. All external dependencies are mocked or stubbed. | Tests must run offline and fast. |

### 2.3 Assertions

| # | Guideline | Why |
|---|---|---|
| 9 | Assert on **behaviour**, not implementation details. Don't assert that an internal method was called unless it's the only way to verify. | Tests survive refactors. |
| 10 | Every test has at least one meaningful assertion. A test that only "doesn't throw" is not sufficient. | Silent passes hide bugs. |
| 11 | Assert on the full response shape for API tests: status code, message, and data fields. | Partial assertions miss response regressions. |
| 12 | Avoid `expect(x).toBeTruthy()` — use specific matchers like `expect(x).toBe(201)` or `expect(x).toEqual({...})`. | Specific assertions catch regressions that truthy checks miss. |

### 2.4 Mocking

| # | Guideline | Why |
|---|---|---|
| 13 | Mocks are scoped narrowly — mock the repository method, not the entire class, where possible. | Over-mocking makes tests brittle and tests the mock instead of the code. |
| 14 | Mock return values are realistic (real IDs, valid shapes). | Fake data like `id: 0` can hide mapping bugs. |
| 15 | Each test resets its mocks in `beforeEach` (`jest.clearAllMocks()` or `jest.resetAllMocks()`). | Stale mock state leaks between tests. |
| 16 | Prefer dependency injection over `jest.mock('module')` for NestJS services. | NestJS's DI makes mocking natural via `overrideProvider`. |

### 2.5 Coverage & Edge Cases

| # | Guideline | Why |
|---|---|---|
| 17 | Every public method has at least: a happy path, an error path, and an edge case. | Coverage without edge cases gives false confidence. |
| 18 | Boundary values are tested: 0, negative, empty string, null/undefined where applicable. | Off-by-one and null-handling bugs hide at boundaries. |
| 19 | Validation failures are tested (missing fields, wrong types, invalid formats). | The ValidationPipe is only as good as the tests that exercise it. |

### 2.6 Performance

| # | Guideline | Why |
|---|---|---|
| 20 | Unit tests run in < 10 seconds total. If a suite is slow, it's probably doing integration work. | Fast feedback loop is essential for developer adoption. |
| 21 | No `setTimeout` or `sleep` in tests. Use async/await and lifecycle hooks. | Delays slow the suite and introduce timing flakiness. |

---

## 3. Mock Pull Request Review (Example)

Below is an example of how I would review a junior QA engineer's PR that
adds an API test for `POST /transactions`.

---

### PR: "Add test for transaction creation"

**File: `test/transactions.e2e-spec.ts`**

```typescript
// ❌ Junior engineer's submission
describe('Transactions', () => {
  it('should create transaction', async () => {
    const res = await request(app.getHttpServer())
      .post('/transactions')
      .send({ userId: 1, productId: 1, quantity: 2 });
    expect(res.status).toBeTruthy();
  });
});
```

### Review Comments

> **[Critical] Test name is too vague**
> `it('should create transaction')` doesn't describe the scenario or
> expected outcome. Change to: `it('should return 201 when creating a
> valid transaction')`.

> **[Critical] Assertion is too weak**
> `expect(res.status).toBeTruthy()` will pass for any non-zero status
> (including 404, 500, etc.). Assert on the specific value:
> `expect(res.status).toBe(201)`.

> **[High] No data setup**
> The test assumes user `id: 1` and product `id: 1` exist. In an isolated
> test database, these won't exist unless you create them first. Add an
> `Arrange` section that creates a user and product, then uses their
> returned IDs.

> **[High] No response body assertion**
> The test doesn't verify the response payload — it could be returning
> the wrong user or product linkage. Add:
> ```typescript
> expect(res.body.data).toHaveProperty('id');
> expect(res.body.data).toHaveProperty('user');
> expect(res.body.data).toHaveProperty('product');
> ```

> **[Medium] No cleanup**
> If the test database persists between runs, leftover data will
> accumulate. Add an `afterAll` that drops the tables or resets the
> repositories.

> **[Low] Missing negative test cases**
> This PR only covers the happy path. In the same PR or a follow-up,
> add tests for: non-existent user (404), non-existent product (404),
> quantity exceeding stock (409), and missing required fields (400).

---

## 4. Patterns I Enforce

```
┌─────────────────────────────────────────────────────────┐
│  TEST PATTERN: Given-When-Then naming                    │
│  it('should [expected behaviour] when [condition]', ...) │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  TEST STRUCTURE: AAA                                      │
│  // Arrange — set up data, mocks, preconditions           │
│  // Act     — call the method / endpoint                  │
│  // Assert  — verify the result                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  DATA: factory functions, not inline literals            │
│  const validUser = createTestUser();  // not {name:"x"}  │
└─────────────────────────────────────────────────────────┘
```

## 5. What I Do NOT Enforce (Avoid Over-Engineering)

- I don't require 100% coverage — 80% with meaningful tests beats 100%
  with trivial getter/setter tests.
- I don't require every test to be data-driven — some scenarios are
  clearer as individual `it` blocks.
- I don't reject inline mocks for simple cases — a full mock factory
  is overkill for a one-off test.
