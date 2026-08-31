import { ApiProperty } from '@nestjs/swagger';

export class MerchantAnalyticsMonthDto {
  @ApiProperty({ description: 'Calendar month bucket, formatted YYYY-MM.', example: '2026-07' })
  month: string;

  @ApiProperty({
    description: 'Total loan volume originated in this month, in USD.',
    example: 4200,
  })
  volume: number;

  @ApiProperty({ description: 'Number of loans originated in this month.', example: 9 })
  loanCount: number;

  @ApiProperty({
    description: 'Percentage of loans originated in this month that defaulted.',
    example: 5.5,
  })
  defaultRate: number;

  @ApiProperty({ description: 'Average loan size for this month, in USD.', example: 466.67 })
  avgLoanSize: number;
}

export class MerchantAnalyticsSummaryDto {
  @ApiProperty({
    description: 'Total loan volume across the requested period, in USD.',
    example: 25000,
  })
  totalVolume: number;

  @ApiProperty({ description: 'Total number of loans across the requested period.', example: 50 })
  totalLoans: number;

  @ApiProperty({
    description: 'Average loan size across the requested period, in USD.',
    example: 500,
  })
  avgLoanSize: number;

  @ApiProperty({
    description: 'Percentage of loans that defaulted across the requested period.',
    example: 6,
  })
  defaultRate: number;
}

export class MerchantAnalyticsResponseDto {
  @ApiProperty({ description: 'Unique identifier of the merchant.', example: 'merchant-1' })
  merchantId: string;

  @ApiProperty({
    type: [MerchantAnalyticsMonthDto],
    description: 'Monthly time-series, oldest first.',
  })
  months: MerchantAnalyticsMonthDto[];

  @ApiProperty({ type: MerchantAnalyticsSummaryDto })
  summary: MerchantAnalyticsSummaryDto;
}
