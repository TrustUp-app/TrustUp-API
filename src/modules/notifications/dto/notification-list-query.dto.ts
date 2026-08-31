import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { NotificationType } from './notification-list-response.dto';

const notificationTypes: NotificationType[] = [
  'loan_reminder',
  'loan_overdue',
  'loan_completed',
  'reputation_changed',
  'liquidity_deposited',
  'liquidity_withdrawn',
];

export class NotificationListQueryDto {
  @ApiPropertyOptional({
    description: 'Filter to only return unread notifications',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  unread?: boolean;

  @ApiPropertyOptional({
    description: 'Filter notifications by type',
    enum: notificationTypes,
    example: 'loan_reminder',
  })
  @IsOptional()
  @IsIn(notificationTypes)
  type?: NotificationType;

  @ApiPropertyOptional({
    description: 'Maximum number of notifications to return',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Number of notifications to skip for pagination',
    example: 0,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
