import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for the JWT token response after successful wallet signature verification.
 */
export class AuthResponseDto {
  @ApiProperty({
    description:
      'JWT access token. Include in Authorization: Bearer <token> header. Expires in 15 minutes.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJHQUJDREUuLi4ifQ.signature',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'JWT refresh token. Use POST /auth/refresh to obtain a new access token. Expires in 7 days.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJHQUJDREUuLi4ifQ.signature',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'Access token lifetime in seconds.',
    example: 900,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Token type for the Authorization header.',
    example: 'Bearer',
  })
  tokenType: string;
}
