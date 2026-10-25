import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { NotFoundException, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

/**
 * Unit Tests — UsersService
 *
 * Tests user CRUD logic in isolation by mocking the repository.
 * Verifies:
 *   - Create success path
 *   - Find one / not found
 *   - Update success path
 *   - BUG-001: duplicate email returns fake 201 instead of 409
 */
describe('UsersService', () => {
  let service: UsersService;
  let userRepo: any;

  const mockUser = {
    id: 1,
    name: 'Alice',
    email: 'alice@test.com',
    transactions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
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

    service = module.get(UsersService);
    userRepo = module.get(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- create() -------------------------------------------------------------

  describe('create()', () => {
    it('should create a user and return 201', async () => {
      const dto = { name: 'Bob', email: 'bob@test.com' };
      userRepo.create.mockReturnValue({
        ...dto,
        id: 2,
        transactions: [],
      } as any);
      userRepo.save.mockResolvedValue({
        ...dto,
        id: 2,
        transactions: [],
      } as any);

      const result = await service.create(dto);

      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.message).toBe('User created successfully');
      expect(result.data!.name).toBe('Bob');
      expect(result.data!.email).toBe('bob@test.com');
      expect(result.data!.id).toBe(2);
    });

    // --- BUG-001: Duplicate email returns fake 201 --------------------------

    it('BUG-001: duplicate email returns fake 201 with id:0 (documents bug)', async () => {
      const dto = { name: 'Charlie', email: 'alice@test.com' };
      userRepo.create.mockReturnValue({ ...dto, transactions: [] } as any);
      // TypeORM copies driverError properties to QueryFailedError, so 'code' ends up on the error
      const driverErr = new Error('duplicate key value');
      (driverErr as any).code = '23505';
      userRepo.save.mockRejectedValue(new QueryFailedError('', [], driverErr));

      // Expected: should throw ConflictException (409)
      // Actual (bug): returns 201 with id: 0 and fake data
      const result = await service.create(dto);

      // Document the bug — the service returns success instead of conflict
      expect(result.statusCode).toBe(HttpStatus.CREATED);
      expect(result.data!.id).toBe(0); // ← BUG: fake user, not persisted
    });

    it('should throw on unexpected DB failure', async () => {
      const dto = { name: 'Dave', email: 'dave@test.com' };
      userRepo.create.mockReturnValue({ ...dto } as any);
      const driverErr = new Error('undefined table');
      (driverErr as any).code = '42P01';
      userRepo.save.mockRejectedValue(new QueryFailedError('', [], driverErr));

      await expect(service.create(dto)).rejects.toThrow();
    });
  });

  // --- findAll() ------------------------------------------------------------

  describe('findAll()', () => {
    it('should return all users with 200', async () => {
      userRepo.find.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toHaveLength(1);
      expect(userRepo.find).toHaveBeenCalledWith({
        relations: ['transactions'],
      });
    });
  });

  // --- findOne() ------------------------------------------------------------

  describe('findOne()', () => {
    it('should return a user by ID with 200', async () => {
      userRepo.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.data).toBe(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // --- update() -------------------------------------------------------------

  describe('update()', () => {
    it('should update a user and return 200', async () => {
      const updatedUser = { ...mockUser, name: 'Alice Updated' };
      userRepo.preload.mockResolvedValue(updatedUser);
      userRepo.save.mockResolvedValue(updatedUser);

      const result = await service.update(1, {
        name: 'Alice Updated',
        email: 'alice@test.com',
      });

      expect(result.statusCode).toBe(HttpStatus.OK);
      expect(result.message).toBe('User updated successfully');
      expect(result.data!.name).toBe('Alice Updated');
    });

    it('should throw NotFoundException when updating non-existent user', async () => {
      userRepo.preload.mockResolvedValue(null);

      await expect(
        service.update(999, { name: 'Ghost', email: 'ghost@test.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
