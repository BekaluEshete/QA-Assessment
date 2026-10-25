import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { ApiResponse, ProductStatus } from 'src/constants';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<ApiResponse<Product>> {
    try {
      const product = this.productRepository.create({
        ...dto,
        status: dto.status || ProductStatus.FOR_SALE,
      });
      const savedProduct = await this.productRepository.save(product);
      return {
        statusCode: HttpStatus.CREATED,
        message: 'Product created successfully',
        data: savedProduct,
      };
    } catch (error: unknown) {
      if (
        error instanceof QueryFailedError &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (error as any).code === '23505'
      ) {
        throw new ConflictException('Product name already exists');
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error creating product',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findAll(): Promise<ApiResponse<Product[]>> {
    try {
      const products = await this.productRepository.find({
        relations: ['transactions'],
      });
      return {
        statusCode: HttpStatus.OK,
        message: 'Products retrieved successfully',
        data: products,
      };
    } catch (error: unknown) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error retrieving products',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findOne(id: number): Promise<ApiResponse<Product>> {
    try {
      const product = await this.productRepository.findOne({
        where: { id },
        relations: ['transactions'],
      });
      if (!product) {
        throw new NotFoundException(`Product with ID ${id} not found`);
      }
      return {
        statusCode: HttpStatus.OK,
        message: 'Product retrieved successfully',
        data: product,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error retrieving product',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async update(
    id: number,
    dto: CreateProductDto,
  ): Promise<ApiResponse<Product>> {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    try {
      product.name = dto.name ?? product.name;
      product.price = dto.quantity ?? product.price;
      product.quantity = dto.quantity ?? product.quantity;
      product.status = dto.status ?? product.status;

      const updatedProduct = await this.productRepository.save(product);

      return {
        statusCode: HttpStatus.OK,
        message: 'Product updated successfully',
        data: updatedProduct,
      };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) throw error;
      if (
        error instanceof QueryFailedError &&
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (error as any).code === '23505'
      ) {
        throw new ConflictException('Product name already exists');
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'Error updating product',
          error: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
