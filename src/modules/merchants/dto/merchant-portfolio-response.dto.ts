import { ApiProperty } from '@nestjs/swagger';

export class MerchantPortfolioLoanDto {
    @ApiProperty({ description: 'Internal UUID of the loan.', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
    id: string;

    @ApiProperty({ description: 'On-chain loan identifier.', example: 'loan-123' })
    loanId: string;

    @ApiProperty({ description: 'Total purchase amount in USD.', example: 500 })
    amount: number;

    @ApiProperty({ description: 'Current outstanding balance in USD.', example: 324 })
    remainingBalance: number;

    @ApiProperty({ description: 'Current loan status.', example: 'active' })
    status: string;

    @ApiProperty({
        description: 'Next payment due date.',
        example: '2026-04-13T00:00:00.000Z',
        nullable: true,
    })
    nextPaymentDue: string | null;

    @ApiProperty({ description: 'Loan creation timestamp.', example: '2026-02-13T10:00:00.000Z' })
    createdAt: string;
}

export class MerchantPortfolioPaginationDto {
    @ApiProperty({ example: 20 })
    limit: number;

    @ApiProperty({ example: 0 })
    offset: number;

    @ApiProperty({ example: 12 })
    total: number;
}

export class MerchantPortfolioResponseDto {
    @ApiProperty({ description: 'Unique identifier of the merchant.', example: 'merchant-1' })
    merchantId: string;

    @ApiProperty({ description: 'Total number of loans ever created at this merchant.', example: 50 })
    totalLoans: number;

    @ApiProperty({ description: 'Number of currently active loans.', example: 12 })
    activeLoansCount: number;

    @ApiProperty({ description: 'Number of fully repaid loans.', example: 35 })
    completedLoansCount: number;

    @ApiProperty({ description: 'Number of defaulted loans.', example: 3 })
    defaultedLoansCount: number;

    @ApiProperty({ description: 'Total loan volume in USD across the merchant lifetime.', example: 25000 })
    totalVolume: number;

    @ApiProperty({ description: 'Sum of remaining balances across active loans, in USD.', example: 4200 })
    outstandingBalance: number;

    @ApiProperty({
        description: 'Percentage of loans that were fully repaid (completedLoans / totalLoans * 100).',
        example: 92.11,
    })
    repaymentRate: number;

    @ApiProperty({ type: [MerchantPortfolioLoanDto], description: 'Paginated list of the merchant active loans.' })
    activeLoans: MerchantPortfolioLoanDto[];

    @ApiProperty({ type: MerchantPortfolioPaginationDto })
    pagination: MerchantPortfolioPaginationDto;
}
