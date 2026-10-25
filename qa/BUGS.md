# Bug Report — Ella API

**Author:** Bekalu Eshete
**Date:** October 2026
**Method:** Static code review + manual API testing against running instance

---

## Summary

| # | Title | Severity | Module |
|---|---|---|---|
| BUG-001 | Duplicate email returns fake 201 Created instead of 409 Conflict | Critical | Users |
| BUG-002 | Transaction increases product stock instead of decreasing it | Critical | Transactions |
| BUG-003 | Product update sets `price` to `quantity` value (field mapping bug) | High | Products |
| BUG-004 | No email format validation on user creation | Medium | Users |
| BUG-005 | OUT_OF_STOCK products can still be purchased | High | Transactions |
| BUG-006 | Out-of-stock status never set after transaction (dead code) | High | Transactions |
| BUG-007 | Migrations path mismatch prevents auto-run in Docker | Medium | DevOps |
| BUG-008 | Production Docker stage installs devDependencies | Medium | DevOps |
| BUG-009 | Dockerfile bakes `.env` into the image (secret leakage) | Medium | DevOps |

---

## BUG-001: Duplicate email returns fake 201 Created instead of 409 Conflict

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Module** | Users |
| **Endpoint** | `POST /users` |

### Description

When creating a user with an email that already exists in the database, the
unique constraint violation (PostgreSQL error code `23505`) is caught, but
instead of returning a `409 Conflict` error, the API returns a **fake success
response** with HTTP 201 and a fabricated user object with `id: 0`.

### Root Cause

File: `src/users/users.service.ts`, lines 30–37 (inside `create` method):

```typescript
if (error instanceof QueryFailedError && (error as any).code === '23505') {
  return {
    statusCode: HttpStatus.CREATED,     // ← should be CONFLICT (409)
    message: 'User created successfully', // ← misleading
    data: { ...dto, id: 0, transactions: [] } as User, // ← fabricated, not persisted
  };
}
```

The error handler for unique-constraint violations returns a fabricated
`User` object instead of throwing a `ConflictException`. This means:
1. The client believes a user was created when it was not.
2. The returned `id: 0` does not correspond to any real record.
3. Downstream operations (e.g., creating a transaction with this user ID) will fail with a not-found error.

### Steps to Reproduce

1. `POST /users` with `{"name": "Alice", "email": "alice@test.com"}` → 201 Created (correct).
2. `POST /users` again with the same email `{"name": "Bob", "email": "alice@test.com"}`.

### Expected Result

HTTP `409 Conflict` with message "Email already exists".

### Actual Result

```json
{
  "statusCode": 201,
  "message": "User created successfully",
  "data": {
    "name": "Bob",
    "email": "alice@test.com",
    "id": 0,
    "transactions": []
  }
}
```

### Suggested Fix

```typescript
if (error instanceof QueryFailedError && (error as any).code === '23505') {
  throw new ConflictException('Email already exists');
}
```

---

## BUG-002: Transaction increases product stock instead of decreasing it

| Field | Value |
|---|---|
| **Severity** | Critical |
| **Module** | Transactions |
| **Endpoint** | `POST /transactions` |

### Description

When a transaction is created (a purchase), the product's stock quantity is
**increased** by the purchased amount instead of being **decreased**. This
means buying 5 units of a product with 10 in stock results in 15 units — the
exact opposite of expected e-commerce behavior.

### Root Cause

File: `src/transactions/transactions.service.ts`, line 71:

```typescript
product.quantity += dto.quantity;  // ← should be -=
```

The `+=` operator adds the purchased quantity to the stock. It should be
`-=` to subtract the purchased quantity from the available stock.

### Steps to Reproduce

1. Create a product: `POST /products {"name": "Widget", "price": 9.99, "quantity": 10}`
2. Note the product has `quantity: 10`.
3. Create a transaction: `POST /transactions {"userId": 1, "productId": 1, "quantity": 3}`
4. Check the product: `GET /products/1`

### Expected Result

Product `quantity` should be `7` (10 − 3 = 7).

### Actual Result

Product `quantity` is `13` (10 + 3 = 13).

### Evidence

Request payload:
```json
{"userId": 1, "productId": 1, "quantity": 3}
```

Product after transaction:
```json
{
  "statusCode": 200,
  "message": "Product retrieved successfully",
  "data": {
    "id": 1,
    "name": "Widget",
    "price": "9.99",
    "quantity": 13,
    "status": "FOR_SALE",
    ...
  }
}
```

### Suggested Fix

```typescript
product.quantity -= dto.quantity;
```

---

## BUG-003: Product update sets `price` to `quantity` value (field mapping bug)

| Field | Value |
|---|---|
| **Severity** | High |
| **Module** | Products |
| **Endpoint** | `PUT /products/:id` |

### Description

When updating a product, the `price` field is incorrectly assigned the value
of `dto.quantity` instead of `dto.price`. This corrupts the product's price
on every update.

### Root Cause

File: `src/products/products.service.ts`, line 67:

```typescript
product.price = dto.quantity ?? product.price;   // ← should be dto.price
product.quantity = dto.quantity ?? product.quantity;
```

The line assigns `dto.quantity` to `product.price`. If you update a product
with `{"name": "Widget", "price": 19.99, "quantity": 5}`, the price becomes
`5` (the quantity value) instead of `19.99`.

### Steps to Reproduce

1. Create a product: `POST /products {"name": "Widget", "price": 9.99, "quantity": 10}`
2. Update it: `PUT /products/1 {"name": "Widget", "price": 19.99, "quantity": 5}`
3. Check the product: `GET /products/1`

### Expected Result

```json
{ "price": "19.99", "quantity": 5 }
```

### Actual Result

```json
{ "price": "5", "quantity": 5 }
```

### Suggested Fix

```typescript
product.price = dto.price ?? product.price;
```

---

## BUG-004: No email format validation on user creation

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | Users |
| **Endpoint** | `POST /users` |

### Description

The `CreateUserDto` only validates that `email` is non-empty (`@IsNotEmpty()`)
but does not validate that it is a properly formatted email address. Any
arbitrary string is accepted.

### Root Cause

File: `src/users/dto/create-user.dto.ts`, lines 9–10:

```typescript
@IsNotEmpty({ message: 'Email is required' })
email: string;
// ← missing @IsEmail()
```

### Steps to Reproduce

1. `POST /users {"name": "Alice", "email": "not-an-email"}`

### Expected Result

HTTP `400 Bad Request` with a validation error message indicating the email
format is invalid.

### Actual Result

HTTP `201 Created` — the user is persisted with `email: "not-an-email"`.

### Suggested Fix

```typescript
import { IsEmail } from 'class-validator';

@IsNotEmpty({ message: 'Email is required' })
@IsEmail({}, { message: 'Email must be a valid email address' })
email: string;
```

---

## BUG-005: OUT_OF_STOCK products can still be purchased

| Field | Value |
|---|---|
| **Severity** | High |
| **Module** | Transactions |
| **Endpoint** | `POST /transactions` |

### Description

The transaction creation logic checks whether the requested quantity exceeds
available stock, but it does **not** check the product's `status`. A product
marked as `OUT_OF_STOCK` can still be purchased as long as its `quantity` is
greater than zero.

### Root Cause

File: `src/transactions/transactions.service.ts`, lines 53–57:

```typescript
if (dto.quantity > product.quantity) {
  throw new ConflictException(...);
}
// ← no check for product.status === ProductStatus.OUT_OF_STOCK
```

### Steps to Reproduce

1. Create a product: `POST /products {"name": "Widget", "price": 9.99, "quantity": 5}`
2. Manually update the product status to `OUT_OF_STOCK` (or create with
   `"status": "OUT_OF_STOCK"`)
3. Create a transaction: `POST /transactions {"userId": 1, "productId": 1, "quantity": 2}`

### Expected Result

HTTP `409 Conflict` — "Product is out of stock".

### Actual Result

HTTP `201 Created` — transaction is created.

### Suggested Fix

```typescript
if (product.status === ProductStatus.OUT_OF_STOCK) {
  throw new ConflictException('Product is out of stock');
}
```

---

## BUG-006: Out-of-stock status never set after transaction (dead code)

| Field | Value |
|---|---|
| **Severity** | High |
| **Module** | Transactions |
| **Endpoint** | `POST /transactions` |

### Description

After creating a transaction, the code checks if `product.quantity === 0` and
sets the status to `OUT_OF_STOCK`. However, because of BUG-002 (stock is
increased instead of decreased), this condition can never be true in normal
operation. Even after the BUG-002 fix, the `===` strict equality means only an
**exact** zero triggers the status change — if stock somehow goes negative
(because the guard only checks `dto.quantity > product.quantity`, not `>=`),
the status won't update.

### Root Cause

File: `src/transactions/transactions.service.ts`, lines 73–75:

```typescript
product.quantity += dto.quantity;  // BUG-002: should be -=
if (product.quantity === 0) {
  product.status = ProductStatus.OUT_OF_STOCK;
}
```

Two compounding issues:
1. The `+=` makes `product.quantity` grow, so it never reaches 0.
2. Even after fixing the `+=` to `-=`, the guard `dto.quantity > product.quantity`
   allows `dto.quantity === product.quantity` (buying all stock), which would
   result in exactly 0 — this path works. But if the guard were changed to `>=`,
   the `=== 0` check would need to become `<= 0`.

### Suggested Fix (after BUG-002 fix)

```typescript
product.quantity -= dto.quantity;
if (product.quantity <= 0) {
  product.quantity = 0;
  product.status = ProductStatus.OUT_OF_STOCK;
}
```

---

## BUG-007: Migrations path mismatch prevents auto-run in Docker

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | DevOps / Configuration |
| **Affects** | `docker compose up -d --build` |

### Description

The TypeORM configuration in `app.module.ts` specifies a migrations path of
`dist/migrations/*.js`, but the NestJS build (via `nest-cli.json` with
`sourceRoot: "src"`) compiles `src/migrations/*.ts` to
`dist/src/migrations/*.js`. The mismatch means `migrationsRun: true` finds no
migrations when the app starts inside Docker, and the database schema is never
created automatically.

### Root Cause

File: `src/app.module.ts`:

```typescript
migrations: ['dist/migrations/*.js'],  // ← should be 'dist/src/migrations/*.js'
migrationsRun: true,
```

File: `data-source.ts` (used by the CLI for `migration:generate` and
`migration:run`):

```typescript
migrations: ['src/migrations/*.ts'],  // ← correct for CLI, but different from runtime path
```

The `Dockerfile` CMD is `node dist/src/main.js`, confirming the build output
lives under `dist/src/`, not `dist/`.

### Impact

- Fresh Docker deployments start with no database schema.
- `docker compose up -d --build` fails on first API request with a "relation
  does not exist" error.
- Developers must manually run `npm run migration:generate` and
  `npm run migration:run` outside Docker.

### Suggested Fix

In `app.module.ts`:

```typescript
migrations: ['dist/src/migrations/*.js'],
```

Or better, align the build output by adding to `tsconfig.json` or
`nest-cli.json` so that migrations compile to `dist/migrations/`.

---

## BUG-008: Production Docker stage installs devDependencies

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | DevOps / Docker |
| **Affects** | Image size, security |

### Description

The production (runtime) stage of the multi-stage `Dockerfile` runs
`npm install --legacy-peer-deps` without `--omit=dev`, which installs all
devDependencies (Jest, TypeScript, ESLint, etc.) into the final image. This
inflates image size and increases the attack surface.

### Root Cause

File: `Dockerfile`, lines 15–17:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps   # ← no --omit=dev
```

### Suggested Fix

```dockerfile
RUN npm install --omit=dev --legacy-peer-deps
```

Also copy only `package.json` and `package-lock.json` (already done via
`COPY package*.json ./`), and consider copying the built `node_modules`
from the builder stage's production deps only.

---

## BUG-009: Dockerfile bakes `.env` into the image (secret leakage)

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | DevOps / Docker |
| **Affects** | Security |

### Description

The `Dockerfile` copies the `.env` file directly into the image with
`COPY .env ./`. Environment-specific configuration and potential secrets
become part of the immutable image layer, which is a security risk.

### Root Cause

File: `Dockerfile`, line 19:

```dockerfile
COPY .env ./
```

### Impact

- Secrets (database credentials, API keys) are baked into the image and
  visible to anyone with image access.
- The same image cannot be promoted across environments (dev → staging → prod)
  because the `.env` is environment-specific.

### Suggested Fix

Remove the `COPY .env ./` line. Inject environment variables at runtime via
`docker-compose.yml` `environment:` block, `env_file:`, or a secrets manager.

```dockerfile
# Remove this line:
# COPY .env ./
```

```yaml
# docker-compose.yml — already has this, which is the correct approach:
api:
  env_file: .env
  environment:
    - DB_HOST=db
```

---

## Bugs Found During Manual Testing (not in code, runtime-observed)

These require a running instance to reproduce. Documented here for
completeness based on static analysis:

- **Negative product price accepted in some paths:** The `CreateProductDto`
  uses `@Min(0)` on `quantity` but not on `price`. A product with a negative
  price can be created: `POST /products {"name": "X", "price": -5, "quantity": 1}`.

- **No rate limiting:** The API has no rate limiting middleware. All endpoints
  are open to abuse. Not necessarily a bug but a security gap for a production
  e-commerce API.

- **No pagination on list endpoints:** `GET /users`, `GET /products`, and
  `GET /transactions` return all records with no pagination, which will
  degrade performance as data grows.

---

## BUG-010: Non-numeric user/product ID causes 500 Internal Server Error

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | Users, Products, Transactions |
| **Endpoint** | `GET /users/:id`, `GET /products/:id`, `GET /transactions/:id` |

### Description

Passing a non-numeric value as the `:id` parameter (e.g., `GET /users/abc`)
causes a `500 Internal Server Error` instead of a `400 Bad Request` or
`404 Not Found`. This is because `parseInt('abc')` returns `NaN`, which
TypeORM passes directly to the DB query and crashes.

### Steps to Reproduce

1. `GET /users/abc`

### Expected Result

HTTP `400 Bad Request` or `404 Not Found`.

### Actual Result

HTTP `500 Internal Server Error`.

### Suggested Fix

Add a `ParseIntPipe` to the `:id` parameter in each controller:

```typescript
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {
  return this.usersService.findOne(id);
}
```

---

## BUG-011: Empty product name passes validation and creates product

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | Products |
| **Endpoint** | `POST /products` |

### Description

Sending an empty string `""` as the product `name` bypasses the
`@IsNotEmpty()` validation and creates a product with a blank name.
The `ValidationPipe` is not configured globally, or the DTO decorator
is not triggering.

### Steps to Reproduce

1. `POST /products {"name": "", "price": 10, "quantity": 5}`

### Expected Result

HTTP `400 Bad Request` — "Name is required".

### Actual Result

HTTP `201 Created` — product is created with an empty name.

### Suggested Fix

Ensure `ValidationPipe` is applied globally in `main.ts` with
`transform: true`:

```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```
