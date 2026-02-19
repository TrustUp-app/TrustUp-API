import { ApiProperty } from '@nestjs/swagger';

export class SchedulePaymentDto {
  @ApiProperty({ description: 'Sequential payment number', example: 1 })
  paymentNumber: number;

  @ApiProperty({ description: 'Payment amount in USD', example: 102.67 })
  amount: number;

  @ApiProperty({
    description: 'Payment due date in ISO 8601 format',
    example: '2026-03-13T00:00:00.000Z',
  })
  dueDate: string;
}

export class LoanQuoteResponseDto {
  @ApiProperty({ description: 'Total purchase amount', example: 500 })
  amount: number;

  @ApiProperty({ description: 'Upfront guarantee (20% of amount)', example: 100 })
  guarantee: number;

  @ApiProperty({ description: 'Financed loan amount (80% of amount)', example: 400 })
  loanAmount: number;

  @ApiProperty({ description: 'Annual interest rate percentage', example: 8 })
  interestRate: number;

  @ApiProperty({ description: 'Total amount to be repaid including interest', example: 410.67 })
  totalRepayment: number;

  @ApiProperty({ description: 'Loan term in months', example: 4 })
  term: number;

  @ApiProperty({
    description: 'Monthly repayment schedule',
    type: [SchedulePaymentDto],
  })
  schedule: SchedulePaymentDto[];
}
