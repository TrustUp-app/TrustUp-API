import { ApiProperty } from '@nestjs/swagger';

export class MerchantSummaryDto {
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
    description: 'Business category of the merchant.',
    example: 'Electronics',
  })
  category: string;

  @ApiProperty({
    description: 'Whether the merchant is currently active.',
    example: true,
  })
  isActive: boolean;
}
