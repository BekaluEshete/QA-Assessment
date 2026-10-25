import { Response } from 'supertest';
import {
  createUser,
  createProduct,
  createTransaction,
  getAllTransactions,
  getTransactionById,
  getProductById,
} from './helpers/api-client';
import { validUserPayload, validProductPayload } from './helpers/test-data';

/**
 * API Tests — Transactions Module
 *
 * Covers: creation, validation, error cases, stock-related bugs.
 * Run: npx jest --config test/jest-e2e.json --testPathPattern transactions.api
 */

describe('API: Transactions Module', () => {
  // --- POST /transactions (Create) ------------------------------------------

  describe('POST /transactions', () => {
    it('should create a transaction with valid payload and return 201', async () => {
      // Arrange: create user and product
      const userPayload = validUserPayload();
      const userRes = await createUser(userPayload.name, userPayload.email);
      const userId = userRes.body.data.id;

      const productPayload = validProductPayload({ price: 25, quantity: 100 });
      const productRes = await createProduct(productPayload);
      const productId = productRes.body.data.id;

      // Act
      const res: Response = await createTransaction({
        userId,
        productId,
        quantity: 5,
      });

      // Assert
      expect(res.status).toBe(201);
      expect(res.body.statusCode).toBe(201);
      expect(res.body.message).toBe('Transaction created successfully');
      expect(res.body.data.id).toBeGreaterThan(0);
      expect(res.body.data.quantity).toBe(5);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.id).toBe(userId);
      expect(res.body.data.product).toBeDefined();
      expect(res.body.data.product.id).toBe(productId);
    });

    it('should return 400 when userId is missing', async () => {
      const res: Response = await createTransaction({
        productId: 1,
        quantity: 1,
      } as any);

      expect(res.status).toBe(400);
    });

    it('should return 400 when productId is missing', async () => {
      const res: Response = await createTransaction({
        userId: 1,
        quantity: 1,
      } as any);

      expect(res.status).toBe(400);
    });

    it('should return 400 when quantity is less than 1', async () => {
      const res: Response = await createTransaction({
        userId: 1,
        productId: 1,
        quantity: 0,
      });

      expect(res.status).toBe(400);
    });

    it('should return 400 when quantity is negative', async () => {
      const res: Response = await createTransaction({
        userId: 1,
        productId: 1,
        quantity: -1,
      });

      expect(res.status).toBe(400);
    });

    it('should return 404 when user does not exist', async () => {
      // Create a valid product
      const productRes = await createProduct(validProductPayload());
      const productId = productRes.body.data.id;

      const res: Response = await createTransaction({
        userId: 999999,
        productId,
        quantity: 1,
      });

      expect(res.status).toBe(404);
    });

    it('should return 404 when product does not exist', async () => {
      // Create a valid user
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

    it('should return 409 when quantity exceeds available stock', async () => {
      // Create user and product with limited stock
      const userPayload = validUserPayload();
      const userRes = await createUser(userPayload.name, userPayload.email);
      const userId = userRes.body.data.id;

      const productRes = await createProduct(
        validProductPayload({ quantity: 3 }),
      );
      const productId = productRes.body.data.id;

      const res: Response = await createTransaction({
        userId,
        productId,
        quantity: 10, // more than available (3)
      });

      expect(res.status).toBe(409);
    });
  });

  // --- GET /transactions (Find All) -----------------------------------------

  describe('GET /transactions', () => {
    it('should return 200 with array of transactions', async () => {
      const res: Response = await getAllTransactions();

      expect(res.status).toBe(200);
      expect(res.body.statusCode).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // --- GET /transactions/:id (Find One) -------------------------------------

  describe('GET /transactions/:id', () => {
    it('should return 200 with the transaction when ID exists', async () => {
      // Create user, product, and transaction
      const userPayload = validUserPayload();
      const userRes = await createUser(userPayload.name, userPayload.email);
      const userId = userRes.body.data.id;

      const productRes = await createProduct(validProductPayload({ quantity: 50 }));
      const productId = productRes.body.data.id;

      const txRes = await createTransaction({
        userId,
        productId,
        quantity: 2,
      });
      const transactionId = txRes.body.data.id;

      const res: Response = await getTransactionById(transactionId);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(transactionId);
      expect(res.body.data.quantity).toBe(2);
      expect(res.body.data.user.id).toBe(userId);
      expect(res.body.data.product.id).toBe(productId);
    });

    it('should return 404 when transaction ID does not exist', async () => {
      const res: Response = await getTransactionById(999999);

      expect(res.status).toBe(404);
    });
  });

  // --- Stock update behavior ------------------------------------------------

  describe('Stock update after transaction', () => {
    // NOTE: BUG-002 — stock increases instead of decreasing
    it('BUG-002: product stock increases instead of decreasing after purchase', async () => {
      // Create user and product with 50 in stock
      const userPayload = validUserPayload();
      const userRes = await createUser(userPayload.name, userPayload.email);
      const userId = userRes.body.data.id;

      const productRes = await createProduct(
        validProductPayload({ quantity: 50 }),
      );
      const productId = productRes.body.data.id;

      // Purchase 5 units
      await createTransaction({
        userId,
        productId,
        quantity: 5,
      });

      // Check stock
      const res: Response = await getProductById(productId);

      // BUG-002: stock INCREASES instead of decreasing (see BUGS.md)
      // Expected: 50 - 5 = 45 — Actual: 50 + 5 = 55
      expect(res.body.data.quantity).toBe(55); // documents the bug
    });
  });
});
