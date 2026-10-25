import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';
import { Product } from './entities/product.entity';
import { ApiResponse } from 'src/constants';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  async create(@Body() body: CreateProductDto): Promise<ApiResponse<Product>> {
    return this.productsService.create(body);
  }

  @Get()
  async findAll(): Promise<ApiResponse<Product[]>> {
    return this.productsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<Product>> {
    return this.productsService.findOne(Number(id));
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: CreateProductDto,
  ): Promise<ApiResponse<Product>> {
    return this.productsService.update(Number(id), body);
  }
}
