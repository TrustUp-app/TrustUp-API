import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ example: 'https://merchant.example/webhooks/trustup' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['loan.status_changed'],
    default: ['loan.status_changed'],
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  events?: string[];
}
