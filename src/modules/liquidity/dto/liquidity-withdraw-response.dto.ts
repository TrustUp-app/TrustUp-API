import { ApiProperty } from '@nestjs/swagger';

export class LiquidityWithdrawPreviewDto {
  @ApiProperty({ description: 'Number of shares being redeemed', example: 500 })
  shares: number;

  @ApiProperty({
    description: 'User share balance before withdrawal',
    example: 925,
  })
  ownedShares: number;

  @ApiProperty({
    description: 'User share balance after withdrawal',
    example: 425,
  })
  remainingShares: number;

  @ApiProperty({ description: 'Current pool share price', example: 1.08 })
  currentSharePrice: number;

  @ApiProperty({
    description: 'Gross expected amount before fees',
    example: 540,
  })
  expectedAmount: number;

  @ApiProperty({ description: 'Withdrawal fee in basis points', example: 50 })
  feeBps: number;

  @ApiProperty({ description: 'Withdrawal fee amount', example: 2.7 })
  fee: number;

  @ApiProperty({
    description: 'Net amount expected after fees',
    example: 537.3,
  })
  netAmount: number;

  @ApiProperty({
    description: 'Available liquid funds currently withdrawable from the pool',
    example: 300000,
  })
  availableLiquidity: number;
}

export class LiquidityWithdrawResponseDto {
  @ApiProperty({
    description: 'Unsigned XDR transaction for the withdraw() Soroban call',
    example: 'AAAAAgAAAAA...',
  })
  unsignedXdr: string;

  @ApiProperty({
    description: 'Human-readable transaction summary for the client UI',
    example: 'Withdraw 500 shares from liquidity pool',
  })
  description: string;

  @ApiProperty({
    description: 'Preview of the withdrawal before the user signs the transaction',
    type: LiquidityWithdrawPreviewDto,
  })
  preview: LiquidityWithdrawPreviewDto;
}
