import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for requesting a loan repayment.
 * Validates the payment amount is a positive number.
 */
export class LoanPaymentRequestDto {
  @ApiProperty({
    description:
      'Payment amount in USD (must be greater than zero and not exceed remaining balance)',
    example: 108.33,
    minimum: 0.01,
  })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0.01, { message: 'Payment amount must be greater than zero' })
  amount: number;
}
