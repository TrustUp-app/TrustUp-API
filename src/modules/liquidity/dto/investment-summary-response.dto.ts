import { ApiProperty } from '@nestjs/swagger';

export class InvestmentSummaryResponseDto {
  @ApiProperty({
    description:
      'Total amount the user has deposited into the pool over their lifetime (historical)',
    example: 1000.0,
  })
  totalInvested: number;

  @ApiProperty({
    description: "Current market value of the user's shares in the pool",
    example: 1085.5,
  })
  currentValue: number;

  @ApiProperty({
    description: 'Earnings: currentValue minus totalInvested (may be negative)',
    example: 85.5,
  })
  earnings: number;

  @ApiProperty({
    description: 'Earnings as a percentage of totalInvested (0 when no investment)',
    example: 8.55,
  })
  earningsPercent: number;

  @ApiProperty({
    description: 'Current annualised yield percentage of the pool',
    example: 9.2,
  })
  apy: number;

  @ApiProperty({
    description: 'Total liquidity currently in the pool (USD)',
    example: 2500000.0,
  })
  poolSize: number;

  @ApiProperty({
    description: 'Number of active loans currently funded by the pool',
    example: 142,
  })
  activeLoans: number;

  @ApiProperty({
    description: "User's current share balance in the pool",
    example: 950.123456,
  })
  shares: number;
}
