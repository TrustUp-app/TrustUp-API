import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class ApplyMerchantDto {
  @ApiProperty({
    description: 'Business name of the merchant',
    example: 'TechNova Retail',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'URL of the merchant logo',
    example: 'https://example.com/logo.png',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  logo?: string;

  @ApiProperty({
    description: 'Detailed description of the merchant business',
    example: 'Leading consumer electronics vendor accepting BNPL',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description: 'Category of the merchant business',
    example: 'Electronics',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  category?: string;

  @ApiProperty({
    description: 'Merchant website URL',
    example: 'https://technova.io',
    required: false,
  })
  @IsUrl()
  @IsOptional()
  website?: string;
}

export class MerchantApplicationResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: 'GBUQNNZ53JZZG7V77M44I3D3525EU4Y5M3VDFUBCU6ZCGUBNBUPK5E77' })
  wallet: string;

  @ApiProperty({ example: 'TechNova Retail' })
  name: string;

  @ApiProperty({ example: 'https://example.com/logo.png', required: false })
  logo?: string;

  @ApiProperty({ example: 'Leading consumer electronics vendor', required: false })
  description?: string;

  @ApiProperty({ example: 'Electronics', required: false })
  category?: string;

  @ApiProperty({ example: 'https://technova.io', required: false })
  website?: string;

  @ApiProperty({ example: 'pending', enum: ['pending', 'approved', 'rejected'] })
  status: string;

  @ApiProperty({ example: '2026-08-27T10:00:00.000Z' })
  createdAt: string;
}
