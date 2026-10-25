import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { User } from '../users/entities/user.entity';
import { Product } from '../products/entities/product.entity';
import { ApiResponse, ProductStatus } from 'src/constants';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateTransactionDto): Promise<ApiResponse<Transaction>> {
    try {
      const user = await this.userRepository.findOne({
        where: { id: dto.userId },
      });
      if (!user)
        throw new NotFoundException(`User with ID ${dto.userId} not found`);

      const product = await this.productRepository.findOne({
        where: { id: dto.productId },
      });
      if (!product)
        throw new NotFoundException(
          `Product with ID ${dto.productId} not found`,
        );

      // Check quantity availability
      if (dto.quantity > product.quantity) {
        throw new ConflictException(
          `Requested quantity (${dto.quantity}) exceeds available stock (${product.quantity})`,
        );
      }

      // Create transaction
      const transaction = this.transactionRepository.create({
        user,
        product,
        quantity: dto.quantity,
      });

      // Save transaction
      const savedTransaction =
        await this.transactionRepository.save(transaction);

      product.quantity += dto.quantity;
      if (product.quantity === 0) {
        product.status = ProductStatus.OUT_OF_STOCK;
      }
      await this.productRepository.save(product);

      return {
        statusCode: HttpStatus.CREATED,
        message: 'Transaction created successfully',
        data: savedTransaction,
      };
    } catch (error: unknown) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException
      )
        throw error;
      if (error instanceof QueryFailedError) {
        throw new ConflictException(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          'Database error: ' + (error as any).message,
        );
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error creating transaction',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(): Promise<ApiResponse<Transaction[]>> {
    try {
      const transactions = await this.transactionRepository.find({
        relations: ['user', 'product'],
      });
      return {
        statusCode: HttpStatus.OK,
        message: 'Transactions retrieved successfully',
        data: transactions,
      };
    } catch (error: unknown) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error retrieving transactions',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: number): Promise<ApiResponse<Transaction>> {
    try {
      const transaction = await this.transactionRepository.findOne({
        where: { id },
        relations: ['user', 'product'],
      });
      if (!transaction)
        throw new NotFoundException(`Transaction with ID ${id} not found`);

      return {
        statusCode: HttpStatus.OK,
        message: 'Transaction retrieved successfully',
        data: transaction,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error retrieving transaction',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
