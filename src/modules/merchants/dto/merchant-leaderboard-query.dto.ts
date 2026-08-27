import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum MerchantLeaderboardMetric {
  VOLUME = 'volume',
  SCORE = 'score',
  REPAYMENT_RATE = 'repaymentRate',
  TOTAL_LOANS = 'totalLoans',
}

export class MerchantLeaderboardQueryDto {
  @ApiPropertyOptional({
    description: 'Metric used to rank merchants.',
    enum: MerchantLeaderboardMetric,
    default: MerchantLeaderboardMetric.VOLUME,
    example: MerchantLeaderboardMetric.VOLUME,
  })
  @IsOptional()
  @IsEnum(MerchantLeaderboardMetric, {
    message: 'metric must be one of: volume, score, repaymentRate, totalLoans',
  })
  metric?: MerchantLeaderboardMetric = MerchantLeaderboardMetric.VOLUME;

  @ApiPropertyOptional({
    description: 'Number of merchants to return per page.',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of ranked merchants to skip before starting to return results.',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
