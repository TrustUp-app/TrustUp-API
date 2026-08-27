import { ApiProperty } from '@nestjs/swagger';

export class MerchantDetailDto {
  @ApiProperty({
    description: 'Unique identifier of the merchant.',
    example: 'merchant-1',
  })
  id: string;

  @ApiProperty({
    description: 'Stellar wallet address of the merchant.',
    example: 'GMER...ABC',
  })
  wallet: string;

  @ApiProperty({
    description: 'Display name of the merchant.',
    example: 'TechStore',
  })
  name: string;

  @ApiProperty({
    description: 'URL of the merchant logo image.',
    example: 'https://example.com/logo.png',
  })
  logo: string;

  @ApiProperty({
    description: 'Detailed description of the merchant.',
    example: 'Your one-stop shop for all electronic needs.',
    required: false,
  })
  description?: string;

  @ApiProperty({
    description: 'Business category of the merchant.',
    example: 'Electronics',
    required: false,
  })
  category?: string;

  @ApiProperty({
    description: 'Website URL of the merchant.',
    example: 'https://techstore.com',
    required: false,
  })
  website?: string;

  @ApiProperty({
    description: 'Whether the merchant is currently active.',
    example: true,
  })
  isActive: boolean;

  @ApiProperty({
    description: 'Creation timestamp of the merchant record.',
    example: '2026-01-01T00:00:00Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update timestamp of the merchant record.',
    example: '2026-01-02T00:00:00Z',
    required: false,
  })
  updatedAt?: string;
}
