import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for requesting a liquidity withdrawal preview + unsigned XDR.
 * Shares use the same 7-decimal fixed precision as on-chain pool accounting.
 */
export class LiquidityWithdrawRequestDto {
  @ApiProperty({
    description: 'Number of pool shares to withdraw',
    example: 500,
    minimum: 0.0000001,
  })
  @IsNumber({}, { message: 'Shares must be a number' })
  @Min(0.0000001, { message: 'Shares must be greater than zero' })
  shares: number;
}
