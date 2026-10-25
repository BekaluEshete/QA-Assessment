import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Transaction } from './entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { ProductStatus } from 'src/constants';

/**
 * Unit Tests — TransactionsService
 *
 * Tests the critical purchase logic in isolation by mocking the
 * TypeORM repositories. Verifies:
 *   - Happy path: creates a transaction and updates stock
 *   - Error paths: user not found, product not found, stock exceeded
 *   - BUG-002: stock increments instead of decrementing
 *   - BUG-005: OUT_OF_STOCK products can be purchased
 *   - BUG-006: OUT_OF_STOCK status never set after transaction
 */
describe('TransactionsService', () => {
  let service: TransactionsService;
  let transactionRepo: any;
  let userRepo: any;
  let productRepo: any;

  const mockUser = {
    id: 1,
    name: 'Alice',
    email: 'alice@test.com',
    transactions: [],
  } as any;
  const mockProduct = {
    id: 1,
    name: 'Widget',
    price: 10,
    quantity: 50,
    status: ProductStatus.FOR_SALE,
    transactions: [],
  } as any;

  const mockTransaction = {
    id: 1,
    user: mockUser,
    product: mockProduct,
    quantity: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TransactionsService);
    transactionRepo = module.get(getRepositoryToken(Transaction));
    userRepo = module.get(getRepositoryToken(User));
    productRepo = module.get(getRepositoryToken(Product));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- create() — Happy path ------------------------------------------------

  describe('create()', () => {
    it('should create a transaction and return 201', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      productRepo.findOne.mockResolvedValue({ ...mockProduct });
      transactionRepo.create.mockReturnValue(mockTransaction);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      productRepo.save.mockResolvedValue(mockProduct);

      const result = await service.create({
        userId: 1,
        productId: 1,
        quantity: 5,
      });

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.message).toBe('Transaction created successfully');
      expect(result.data).toBe(mockTransaction);
      expect(transactionRepo.save).toHaveBeenCalledTimes(1);
      expect(productRepo.save).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ userId: 999, productId: 1, quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when product does not exist', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      productRepo.findOne.mockResolvedValue(null);

      await expect(
        service.create({ userId: 1, productId: 999, quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when quantity exceeds stock', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);
      productRepo.findOne.mockResolvedValue({ ...mockProduct, quantity: 3 });

      await expect(
        service.create({ userId: 1, productId: 1, quantity: 10 }),
      ).rejects.toThrow(ConflictException);
    });

    // --- BUG-002: Stock increments instead of decrementing -----------------

    it('BUG-002: stock increments instead of decrementing (documents actual behavior)', async () => {
      const product = { ...mockProduct, quantity: 50 };
      userRepo.findOne.mockResolvedValue(mockUser);
      productRepo.findOne.mockResolvedValue(product);
      transactionRepo.create.mockReturnValue(mockTransaction);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      productRepo.save.mockResolvedValue(product);

      await service.create({ userId: 1, productId: 1, quantity: 5 });

      // Expected: 50 - 5 = 45
      // Actual (bug): 50 + 5 = 55 — the code uses += instead of -=
      expect(product.quantity).toBe(55);
    });

    // --- BUG-005: OUT_OF_STOCK can be purchased -----------------------------

    it('BUG-005: OUT_OF_STOCK product can still be purchased (documents bug)', async () => {
      const outOfStockProduct = {
        ...mockProduct,
        quantity: 10,
        status: ProductStatus.OUT_OF_STOCK,
      };
      userRepo.findOne.mockResolvedValue(mockUser);
      productRepo.findOne.mockResolvedValue(outOfStockProduct);
      transactionRepo.create.mockReturnValue(mockTransaction);
      transactionRepo.save.mockResolvedValue(mockTransaction);

      // Expected: should throw ConflictException
      // Actual (bug): creates the transaction because only quantity is checked
      const result = await service.create({
        userId: 1,
        productId: 1,
        quantity: 2,
      });

      // This assertion documents the bug — the service does NOT check status
      expect(result.statusCode).toBe(HttpStatus.CREATED);
    });

    // --- BUG-006: Out-of-stock status never set (dead code) -----------------

    it('BUG-006: OUT_OF_STOCK status never set after transaction (documents bug)', async () => {
      const product = {
        ...mockProduct,
        quantity: 5,
        status: ProductStatus.FOR_SALE,
      };
      userRepo.findOne.mockResolvedValue(mockUser);
      productRepo.findOne.mockResolvedValue(product);
      transactionRepo.create.mockReturnValue(mockTransaction);
      transactionRepo.save.mockResolvedValue(mockTransaction);
      productRepo.save.mockResolvedValue(product);

      // Buy all 5 units
      await service.create({ userId: 1, productId: 1, quantity: 5 });

      // Expected: quantity = 0, status = OUT_OF_STOCK
      // Actual (bug): quantity = 10 (5 + 5), status = FOR_SALE
      expect(product.quantity).toBe(10);
      expect(product.status).toBe(ProductStatus.FOR_SALE);
    });
  });

  // --- findAll() ------------------------------------------------------------

  describe('findAll()', () => {
    it('should return all transactions with 200', async () => {
      transactionRepo.find.mockResolvedValue([mockTransaction]);

      const result = await service.findAll();

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toHaveLength(1);
      expect(transactionRepo.find).toHaveBeenCalledWith({
        relations: ['user', 'product'],
      });
    });
  });

  // --- findOne() ------------------------------------------------------------

  describe('findOne()', () => {
    it('should return a transaction by ID with 200', async () => {
      transactionRepo.findOne.mockResolvedValue(mockTransaction);

      const result = await service.findOne(1);

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toBe(mockTransaction);
    });

    it('should throw NotFoundException when transaction does not exist', async () => {
      transactionRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});
