import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const VALID_OVERRIDE_STATUSES = [
  'pending',
  'active',
  'completed',
  'defaulted',
  'cancelled',
] as const;
export type ValidOverrideStatus = (typeof VALID_OVERRIDE_STATUSES)[number];

export class OverrideLoanDto {
  @ApiProperty({
    description: 'Target status to override the loan to',
    example: 'completed',
    enum: VALID_OVERRIDE_STATUSES,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_OVERRIDE_STATUSES)
  targetStatus: ValidOverrideStatus;

  @ApiProperty({
    description: 'Mandatory audit justification for the administrative override',
    example: 'Manual settlement confirmed via off-chain proof of payment.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  reason: string;

  @ApiProperty({
    description: 'Optional action tag characterizing the override operation',
    example: 'FORCE_SETTLE',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  action?: string;
}

export class OverrideLoanResponseDto {
  @ApiProperty({ example: 'l1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  loanId: string;

  @ApiProperty({ example: 'active' })
  previousStatus: string;

  @ApiProperty({ example: 'completed' })
  status: string;

  @ApiProperty({ example: 'FORCE_SETTLE' })
  action: string;

  @ApiProperty({ example: 'Manual settlement confirmed via off-chain proof of payment.' })
  reason: string;

  @ApiProperty({ example: 'GADMIN...XYZ' })
  overriddenBy: string;

  @ApiProperty({ example: '2026-08-27T10:00:00.000Z' })
  timestamp: string;
}
