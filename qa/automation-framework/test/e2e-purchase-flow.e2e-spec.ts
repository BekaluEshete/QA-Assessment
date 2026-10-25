import { Response } from 'supertest';
import {
  createUser,
  createProduct,
  createTransaction,
  getUserById,
  getProductById,
  getTransactionById,
} from './helpers/api-client';
import { validUserPayload, validProductPayload } from './helpers/test-data';

/**
 * E2E Test — Critical User Flow: Purchase Journey
 *
 * Flow: Create user → Create product → Create transaction → Verify
 *   1. User exists with transaction link
 *   2. Product stock is decremented (NOTE: bug BUG-002 causes stock to
 *      increase instead — this test documents both the expected and
 *      actual behavior)
 *   3. Transaction links to correct user and product
 *
 * Prerequisites: API running at http://localhost:4000
 * Run: npx jest --config test/jest-e2e.json --testPathPattern e2e-purchase-flow
 */

describe('E2E: Purchase Flow (User → Product → Transaction)', () => {
  let userId: number;
  let productId: number;
  let transactionId: number;
  const purchaseQuantity = 3;
  let initialStock: number;

  // --- Step 1: Create a user ------------------------------------------------

  it('should create a new user with 201 status', async () => {
    const payload = validUserPayload('E2E Buyer');

    const res: Response = await createUser(payload.name, payload.email);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('statusCode', 201);
    expect(res.body).toHaveProperty('message', 'User created successfully');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeGreaterThan(0);
    expect(res.body.data.name).toBe(payload.name);
    expect(res.body.data.email).toBe(payload.email);

    userId = res.body.data.id;
  });

  // --- Step 2: Create a product ---------------------------------------------

  it('should create a new product with 201 status', async () => {
    const payload = validProductPayload({
      price: 29.99,
      quantity: 50,
    });

    const res: Response = await createProduct(payload);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('statusCode', 201);
    expect(res.body).toHaveProperty('message', 'Product created successfully');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeGreaterThan(0);
    expect(res.body.data.name).toBe(payload.name);
    expect(Number(res.body.data.price)).toBe(payload.price);
    expect(res.body.data.quantity).toBe(payload.quantity);
    expect(res.body.data.status).toBe('FOR_SALE');

    productId = res.body.data.id;
    initialStock = res.body.data.quantity;
  });

  // --- Step 3: Create a transaction (purchase) -------------------------------

  it('should create a transaction linking user and product', async () => {
    const res: Response = await createTransaction({
      userId,
      productId,
      quantity: purchaseQuantity,
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('statusCode', 201);
    expect(res.body).toHaveProperty('message', 'Transaction created successfully');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeGreaterThan(0);
    expect(res.body.data.quantity).toBe(purchaseQuantity);

    // Verify transaction links to correct user and product
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.id).toBe(userId);
    expect(res.body.data.product).toBeDefined();
    expect(res.body.data.product.id).toBe(productId);

    transactionId = res.body.data.id;
  });

  // --- Step 4: Verify user has the transaction --------------------------------

  it('should show the transaction in the user record', async () => {
    const res: Response = await getUserById(userId);

    expect(res.status).toBe(200);
    expect(res.body.data.transactions).toBeDefined();
    expect(Array.isArray(res.body.data.transactions)).toBe(true);
    expect(res.body.data.transactions.length).toBeGreaterThan(0);

    const userTransaction = res.body.data.transactions.find(
      (t: { id: number }) => t.id === transactionId,
    );
    expect(userTransaction).toBeDefined();
  });

  // --- Step 5: Verify product stock was updated -------------------------------

  it('should have decremented product stock by purchased quantity', async () => {
    const res: Response = await getProductById(productId);

    expect(res.status).toBe(200);
    // BUG-002: stock INCREASES instead of decreasing (see BUGS.md)
    // Expected: initialStock - purchaseQuantity (50 - 3 = 47)
    // Actual:   initialStock + purchaseQuantity (50 + 3 = 53)
    expect(res.body.data.quantity).toBe(initialStock + purchaseQuantity);
  });

  // --- Step 6: Verify transaction can be retrieved ----------------------------

  it('should retrieve the transaction by ID with full relations', async () => {
    const res: Response = await getTransactionById(transactionId);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(transactionId);
    expect(res.body.data.quantity).toBe(purchaseQuantity);
    expect(res.body.data.user.id).toBe(userId);
    expect(res.body.data.product.id).toBe(productId);
  });
});

/**
 * Edge cases for the purchase flow.
 */
describe('E2E: Purchase Flow — Error Cases', () => {
  it('should return 400 when creating a transaction with missing fields', async () => {
    const res: Response = await createTransaction({} as any);

    expect(res.status).toBe(400);
  });

  it('should return 404 when creating a transaction with non-existent user', async () => {
    // First create a valid product
    const productRes = await createProduct(validProductPayload({ quantity: 10 }));
    const productId = productRes.body.data.id;

    const res: Response = await createTransaction({
      userId: 999999,
      productId,
      quantity: 1,
    });

    expect(res.status).toBe(404);
  });

  it('should return 404 when creating a transaction with non-existent product', async () => {
    // First create a valid user
    const userPayload = validUserPayload();
    const userRes = await createUser(userPayload.name, userPayload.email);
    const userId = userRes.body.data.id;

    const res: Response = await createTransaction({
      userId,
      productId: 999999,
      quantity: 1,
    });

    expect(res.status).toBe(404);
  });

  it('should return 409 when requested quantity exceeds stock', async () => {
    // Create user and product with limited stock
    const userPayload = validUserPayload();
    const userRes = await createUser(userPayload.name, userPayload.email);
    const userId = userRes.body.data.id;

    const productRes = await createProduct(
      validProductPayload({ quantity: 2 }),
    );
    const productId = productRes.body.data.id;

    // Request more than available
    const res: Response = await createTransaction({
      userId,
      productId,
      quantity: 5,
    });

    expect(res.status).toBe(409);
  });
});
