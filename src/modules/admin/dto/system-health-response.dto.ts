import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for admin system health endpoint.
 * Returns detailed system diagnostics only accessible to admin users.
 */
export class SystemHealthResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: {
      status: 'ok',
      uptime: 86400,
      timestamp: '2026-08-20T10:00:00.000Z',
      database: 'connected',
      redis: 'connected',
      stellarNetwork: 'connected',
      version: '0.1.0',
    },
  })
  data: {
    status: string;
    uptime: number;
    timestamp: string;
    database: string;
    redis: string;
    stellarNetwork: string;
    version: string;
  };

  @ApiProperty({ example: 'System health retrieved successfully' })
  message: string;
}
