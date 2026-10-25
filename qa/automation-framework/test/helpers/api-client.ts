import supertest, { Response } from 'supertest';
// Handle CommonJS default export interop
const request = (supertest as any).default ?? supertest;

/**
 * API client wrapper for the Ella API.
 *
 * Centralises the base URL, headers, and common request patterns so
 * test specs stay focused on assertions and scenarios.
 */

const BASE_URL = process.env.API_URL || 'http://localhost:4000';

const api = request(BASE_URL);

// --- User helpers -----------------------------------------------------------

export async function createUser(
  name: string,
  email: string,
): Promise<Response> {
  return api
    .post('/users')
    .send({ name, email })
    .set('Content-Type', 'application/json');
}

export async function getAllUsers(): Promise<Response> {
  return api.get('/users');
}

export async function getUserById(id: number): Promise<Response> {
  return api.get(`/users/${id}`);
}

export async function updateUser(
  id: number,
  body: { name: string; email: string },
): Promise<Response> {
  return api
    .put(`/users/${id}`)
    .send(body)
    .set('Content-Type', 'application/json');
}

// --- Product helpers --------------------------------------------------------

export async function createProduct(body: {
  name: string;
  price: number;
  quantity: number;
  status?: string;
}): Promise<Response> {
  return api
    .post('/products')
    .send(body)
    .set('Content-Type', 'application/json');
}

export async function getAllProducts(): Promise<Response> {
  return api.get('/products');
}

export async function getProductById(id: number): Promise<Response> {
  return api.get(`/products/${id}`);
}

export async function updateProduct(
  id: number,
  body: { name: string; price: number; quantity: number; status?: string },
): Promise<Response> {
  return api
    .put(`/products/${id}`)
    .send(body)
    .set('Content-Type', 'application/json');
}

// --- Transaction helpers ----------------------------------------------------

export async function createTransaction(body: {
  userId: number;
  productId: number;
  quantity: number;
}): Promise<Response> {
  return api
    .post('/transactions')
    .send(body)
    .set('Content-Type', 'application/json');
}

export async function getAllTransactions(): Promise<Response> {
  return api.get('/transactions');
}

export async function getTransactionById(id: number): Promise<Response> {
  return api.get(`/transactions/${id}`);
}

// --- Generic helpers --------------------------------------------------------

export async function healthCheck(): Promise<Response> {
  return api.get('/health');
}

export { api, BASE_URL };
