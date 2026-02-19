import { ApiProperty } from '@nestjs/swagger';

export class ReputationResponseDto {
  @ApiProperty({
    description: 'Stellar wallet address',
    example: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG',
  })
  wallet: string;

  @ApiProperty({
    description: 'Reputation score from 0 to 100',
    example: 75,
    minimum: 0,
    maximum: 100,
  })
  score: number;

  @ApiProperty({
    description: 'Reputation tier derived from score',
    example: 'silver',
    enum: ['gold', 'silver', 'bronze', 'poor'],
  })
  tier: string;

  @ApiProperty({
    description: 'Annual interest rate percentage based on reputation',
    example: 8,
  })
  interestRate: number;

  @ApiProperty({
    description: 'Maximum credit limit in USD based on reputation',
    example: 3000,
  })
  maxCredit: number;

  @ApiProperty({
    description: 'Timestamp of the last reputation update',
    example: '2026-02-13T10:00:00.000Z',
  })
  lastUpdated: string;
}
