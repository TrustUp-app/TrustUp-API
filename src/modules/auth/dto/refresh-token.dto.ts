import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const RefreshTokenSchema = z.object({
  refreshToken: z
    .string({
      required_error: 'Refresh token is required',
    })
    .min(1, 'Refresh token cannot be empty'),
}).strict();

/**
 * DTO for JWT refresh token request payload (used in POST /auth/refresh and DELETE /auth/logout).
 */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'JWT refresh token issued during login or registration',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJHQUJDREUuLi4ifQ.signature',
  })
  refreshToken: string;
}
