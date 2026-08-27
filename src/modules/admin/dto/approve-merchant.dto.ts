import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveMerchantDto {
  @ApiProperty({
    description: 'Whether the merchant application is approved (true) or rejected (false)',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  approved: boolean;

  @ApiProperty({
    description: 'Reason for rejection if approved is false',
    example: 'Incomplete business registration documentation provided.',
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejectionReason?: string;
}

export class ApproveMerchantResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  applicationId: string;

  @ApiProperty({ example: 'GBUQNNZ53JZZG7V77M44I3D3525EU4Y5M3VDFUBCU6ZCGUBNBUPK5E77' })
  wallet: string;

  @ApiProperty({ example: 'approved', enum: ['approved', 'rejected'] })
  status: string;

  @ApiProperty({ example: 'Merchant application has been approved and activated.' })
  message: string;

  @ApiProperty({ required: false, example: 'm1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  merchantId?: string;
}
