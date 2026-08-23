import { ApiProperty } from '@nestjs/swagger';
import { ReputationTier } from '../../reputation/dto/reputation-response.dto';
import { MerchantLeaderboardMetric } from './merchant-leaderboard-query.dto';

export class MerchantLeaderboardEntryDto {
    @ApiProperty({ description: 'Rank position, 1-indexed, for the selected metric.', example: 1 })
    rank: number;

    @ApiProperty({ description: 'Unique identifier of the merchant.', example: 'merchant-1' })
    merchantId: string;

    @ApiProperty({ description: 'Display name of the merchant.', example: 'TechStore' })
    name: string;

    @ApiProperty({ description: 'URL of the merchant logo image.', example: 'https://example.com/logo.png' })
    logo: string;

    @ApiProperty({ description: 'Business category of the merchant.', example: 'Electronics' })
    category: string;

    @ApiProperty({ description: 'Financial score derived from repayment rate, default rate and volume.', example: 87 })
    score: number;

    @ApiProperty({ description: 'Tier derived from the financial score.', example: 'silver', enum: ['gold', 'silver', 'bronze', 'poor'] })
    tier: ReputationTier;

    @ApiProperty({ description: 'Total loan volume in USD across the merchant lifetime.', example: 25000 })
    totalVolume: number;

    @ApiProperty({ description: 'Percentage of loans that were fully repaid.', example: 92.11 })
    repaymentRate: number;

    @ApiProperty({ description: 'Total number of loans ever created at this merchant.', example: 50 })
    totalLoans: number;
}

export class MerchantLeaderboardPaginationDto {
    @ApiProperty({ example: 20 })
    limit: number;

    @ApiProperty({ example: 0 })
    offset: number;

    @ApiProperty({ example: 42 })
    total: number;
}

export class MerchantLeaderboardResponseDto {
    @ApiProperty({ description: 'Metric used to rank the merchants below.', enum: MerchantLeaderboardMetric, example: MerchantLeaderboardMetric.VOLUME })
    metric: MerchantLeaderboardMetric;

    @ApiProperty({ type: [MerchantLeaderboardEntryDto] })
    data: MerchantLeaderboardEntryDto[];

    @ApiProperty({ type: MerchantLeaderboardPaginationDto })
    pagination: MerchantLeaderboardPaginationDto;
}
