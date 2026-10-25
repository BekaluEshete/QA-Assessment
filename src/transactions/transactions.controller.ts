import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { ApiResponse } from 'src/constants';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  async create(
    @Body() dto: CreateTransactionDto,
  ): Promise<ApiResponse<Transaction>> {
    return this.transactionsService.create(dto);
  }

  @Get()
  async findAll(): Promise<ApiResponse<Transaction[]>> {
    return this.transactionsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<ApiResponse<Transaction>> {
    return this.transactionsService.findOne(Number(id));
  }
}
