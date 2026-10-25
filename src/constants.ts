export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data?: T;
  error?: string;
}

export enum ProductStatus {
  FOR_SALE = 'FOR_SALE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
}
