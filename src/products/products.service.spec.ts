import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, HttpStatus } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { ProductStatus } from 'src/constants';

/**
 * Unit Tests — ProductsService
 *
 * Tests product CRUD logic in isolation by mocking the repository.
 * Verifies:
 *   - Create with default status
 *   - Find one / not found
 *   - Update field mapping
 *   - BUG-003: price set to quantity on update
 */
describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: any;

  const mockProduct = {
    id: 1,
    name: 'Widget',
    price: 9.99,
    quantity: 50,
    status: ProductStatus.FOR_SALE,
    transactions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            preload: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ProductsService);
    productRepo = module.get(getRepositoryToken(Product));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- create() -------------------------------------------------------------

  describe('create()', () => {
    it('should create a product and return 201', async () => {
      const dto = { name: 'Gadget', price: 15.5, quantity: 100 };
      productRepo.create.mockReturnValue({
        ...dto,
        id: 2,
        status: ProductStatus.FOR_SALE,
      } as any);
      productRepo.save.mockResolvedValue({
        ...dto,
        id: 2,
        status: ProductStatus.FOR_SALE,
      } as any);

      const result = await service.create(dto);

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.data!.name).toBe('Gadget');
      expect(Number(result.data!.price)).toBe(15.5);
      expect(result.data!.quantity).toBe(100);
      expect(result.data!.status).toBe(ProductStatus.FOR_SALE);
    });

    it('should use FOR_SALE as default status when not provided', async () => {
      const dto = { name: 'Gadget', price: 10, quantity: 5 };
      productRepo.create.mockReturnValue({
        ...dto,
        status: ProductStatus.FOR_SALE,
      } as any);
      productRepo.save.mockResolvedValue({
        ...dto,
        id: 3,
        status: ProductStatus.FOR_SALE,
      } as any);

      const result = await service.create(dto);

      expect(result.data!.status).toBe(ProductStatus.FOR_SALE);
    });

    it('should accept custom status when provided', async () => {
      const dto = {
        name: 'Gadget',
        price: 10,
        quantity: 0,
        status: ProductStatus.OUT_OF_STOCK,
      };
      productRepo.create.mockReturnValue({ ...dto } as any);
      productRepo.save.mockResolvedValue({ ...dto, id: 4 } as any);

      const result = await service.create(dto);

      expect(result.data!.status).toBe(ProductStatus.OUT_OF_STOCK);
    });
  });

  // --- findAll() ------------------------------------------------------------

  describe('findAll()', () => {
    it('should return all products with 200', async () => {
      productRepo.find.mockResolvedValue([mockProduct]);

      const result = await service.findAll();

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toHaveLength(1);
      expect(productRepo.find).toHaveBeenCalledWith({
        relations: ['transactions'],
      });
    });
  });

  // --- findOne() ------------------------------------------------------------

  describe('findOne()', () => {
    it('should return a product by ID with 200', async () => {
      productRepo.findOne.mockResolvedValue(mockProduct);

      const result = await service.findOne(1);

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toBe(mockProduct);
    });

    it('should throw NotFoundException when product does not exist', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // --- update() -------------------------------------------------------------

  describe('update()', () => {
    it('should update product name, quantity, and status', async () => {
      const existing = { ...mockProduct };
      productRepo.findOne.mockResolvedValue(existing);
      productRepo.save.mockResolvedValue(existing);

      const result = await service.update(1, {
        name: 'Updated Widget',
        price: 9.99,
        quantity: 30,
        status: ProductStatus.OUT_OF_STOCK,
      });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(existing.name).toBe('Updated Widget');
      expect(existing.quantity).toBe(30);
      expect(existing.status).toBe(ProductStatus.OUT_OF_STOCK);
    });

    // --- BUG-003: price set to quantity on update --------------------------

    it('BUG-003: price is set to quantity value on update (documents bug)', async () => {
      const existing = { ...mockProduct, price: 9.99, quantity: 50 };
      productRepo.findOne.mockResolvedValue(existing);
      productRepo.save.mockResolvedValue(existing);

      await service.update(1, {
        name: 'Widget',
        price: 19.99, // New price
        quantity: 5, // New quantity
      });

      // Expected: price should be 19.99
      // Actual (bug): price becomes 5 (the quantity value)
      // Code line: product.price = dto.quantity ?? product.price;
      expect(Number(existing.price)).toBe(5);
    });

    it('should throw NotFoundException when product does not exist', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update(999, { name: 'X', price: 10, quantity: 5 }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
