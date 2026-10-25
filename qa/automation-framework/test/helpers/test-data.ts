/**
 * Test data factory functions.
 *
 * Generates unique, realistic test data so tests can run in parallel
 * without collisions (e.g., unique email addresses).
 */

let userCounter = 0;
let productCounter = 0;

/**
 * Generate a unique email for test users.
 * Format: testuser_<timestamp>_<counter>@test.com
 */
export function uniqueEmail(): string {
  userCounter += 1;
  const timestamp = Date.now();
  return `testuser_${timestamp}_${userCounter}@test.com`;
}

/**
 * Generate a unique user payload.
 */
export function validUserPayload(name?: string) {
  return {
    name: name || `Test User ${userCounter}`,
    email: uniqueEmail(),
  };
}

/**
 * Generate a unique product payload.
 */
export function validProductPayload(overrides?: Partial<{
  name: string;
  price: number;
  quantity: number;
  status: string;
}>) {
  productCounter += 1;
  const timestamp = Date.now();
  return {
    name: overrides?.name || `Test Product ${timestamp}_${productCounter}`,
    price: overrides?.price ?? 10.0,
    quantity: overrides?.quantity ?? 100,
    ...(overrides?.status ? { status: overrides.status } : {}),
  };
}

/**
 * Generate a valid transaction payload.
 */
export function validTransactionPayload(userId: number, productId: number, quantity = 1) {
  return {
    userId,
    productId,
    quantity,
  };
}
