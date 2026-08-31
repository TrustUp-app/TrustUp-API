import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response shape for PATCH /users/me (API-05).
 * Distinct from UserProfileDto (GET /users/me) because it exposes
 * `updatedAt` instead of `createdAt`.
 */
export class UpdateUserProfileDto {
  @ApiProperty({
    description: 'Stellar wallet address',
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
  })
  wallet: string;

  @ApiPropertyOptional({ description: 'Display name', example: 'Maria Garcia', nullable: true })
  name: string | null;

  @ApiPropertyOptional({
    description: 'Avatar URL (HTTPS)',
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  avatar: string | null;

  @ApiProperty({
    description: 'User preferences',
    example: { notifications: true, theme: 'dark', language: 'en' },
  })
  preferences: {
    notifications: boolean;
    theme: string;
    language: string;
  };

  @ApiProperty({ example: '2026-02-20T10:00:00.000Z' })
  updatedAt: string;
}
