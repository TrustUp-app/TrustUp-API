import { IsNumber, IsUUID, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoanQuoteRequestDto {
  @ApiProperty({
    description: 'Total purchase amount in USD',
    example: 500,
    minimum: 1,
    maximum: 10000,
  })
  @IsNumber()
  @Min(1, { message: 'Amount must be at least $1' })
  @Max(10000, { message: 'Amount cannot exceed $10,000' })
  amount: number;

  @ApiProperty({
    description: 'UUID of the merchant providing the goods/services',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID('4', { message: 'Merchant must be a valid UUID' })
  merchant: string;

  @ApiProperty({
    description: 'Loan term in months',
    example: 4,
    minimum: 1,
    maximum: 12,
  })
  @IsInt({ message: 'Term must be a whole number of months' })
  @Min(1, { message: 'Term must be at least 1 month' })
  @Max(12, { message: 'Term cannot exceed 12 months' })
  term: number;
}
