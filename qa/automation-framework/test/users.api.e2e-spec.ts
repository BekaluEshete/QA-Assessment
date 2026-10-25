import { Response } from 'supertest';
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
} from './helpers/api-client';
import { validUserPayload, uniqueEmail } from './helpers/test-data';

/**
 * API Tests — Users Module
 *
 * Covers: CRUD operations, validation, error cases.
 * Run: npx jest --config test/jest-e2e.json --testPathPattern users.api
 */

describe('API: Users Module', () => {
  // --- POST /users (Create) --------------------------------------------------

  describe('POST /users', () => {
    it('should create a user with valid payload and return 201', async () => {
      const payload = validUserPayload();

      const res: Response = await createUser(payload.name, payload.email);

      expect(res.status).toBe(201);
      expect(res.body.statusCode).toBe(201);
      expect(res.body.message).toBe('User created successfully');
      expect(res.body.data.id).toBeGreaterThan(0);
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.email).toBe(payload.email);
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();
    });

    it('should return 400 when name is missing', async () => {
      const res: Response = await createUser('', uniqueEmail());

      expect(res.status).toBe(400);
    });

    it('should return 400 when email is missing', async () => {
      const res: Response = await createUser('Test User', '');

      expect(res.status).toBe(400);
    });

    it('should return 400 when name is not a string', async () => {
      const res: Response = await createUser(123 as any, uniqueEmail());

      expect(res.status).toBe(400);
    });

    // NOTE: BUG-001 — Duplicate email returns 201 with fake user instead of 409
    it('BUG-001: duplicate email returns fake 201 instead of 409', async () => {
      const payload = validUserPayload();

      // First creation — should succeed
      const res1: Response = await createUser(payload.name, payload.email);
      expect(res1.status).toBe(201);

      // Second creation with same email — should be 409 Conflict
      const res2: Response = await createUser('Different Name', payload.email);

      // Document the bug: API returns 201 with id: 0 instead of 409
      expect(res2.status).toBe(201); // ← BUG: should be 409
      expect(res2.body.data.id).toBe(0); // ← BUG: fake user, not persisted
    });
  });

  // --- GET /users (Find All) -------------------------------------------------

  describe('GET /users', () => {
    it('should return 200 with array of users', async () => {
      const res: Response = await getAllUsers();

      expect(res.status).toBe(200);
      expect(res.body.statusCode).toBe(200);
      expect(res.body.message).toBe('Users retrieved successfully');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // --- GET /users/:id (Find One) --------------------------------------------

  describe('GET /users/:id', () => {
    it('should return 200 with the user when ID exists', async () => {
      // Create a user first
      const payload = validUserPayload();
      const createRes = await createUser(payload.name, payload.email);
      const userId = createRes.body.data.id;

      const res: Response = await getUserById(userId);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(userId);
      expect(res.body.data.name).toBe(payload.name);
      expect(res.body.data.email).toBe(payload.email);
    });

    it('should return 404 when user ID does not exist', async () => {
      const res: Response = await getUserById(999999);

      expect(res.status).toBe(404);
    });

    it('BUG-010: non-numeric user ID returns 500 instead of 400 (documents bug)', async () => {
      const res: Response = await getUserById('abc' as any);
      // Expected: 400 — Actual: 500 (ParseIntPipe not applied)
      expect(res.status).toBe(500);
    });
  });

  // --- PUT /users/:id (Update) ----------------------------------------------

  describe('PUT /users/:id', () => {
    it('should update user name and email with 200', async () => {
      // Create a user first
      const payload = validUserPayload();
      const createRes = await createUser(payload.name, payload.email);
      const userId = createRes.body.data.id;

      // Update
      const newEmail = uniqueEmail();
      const res: Response = await updateUser(userId, {
        name: 'Updated Name',
        email: newEmail,
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('User updated successfully');
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.email).toBe(newEmail);
    });

    it('should return 404 when updating a non-existent user', async () => {
      const res: Response = await updateUser(999999, {
        name: 'Ghost',
        email: uniqueEmail(),
      });

      expect(res.status).toBe(404);
    });
  });
});
