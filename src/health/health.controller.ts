import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Health check endpoint for load balancer / monitoring integration.
 *
 * GET /health returns:
 *   - 200 { status: 'ok', database: 'connected' } when the DB is reachable
 *   - 503 { status: 'error', database: 'disconnected', error: '...' } when it is not
 */
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check() {
    try {
      // Run a trivial query to verify the DB connection is alive
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        statusCode: 503,
        status: 'error',
        database: 'disconnected',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
