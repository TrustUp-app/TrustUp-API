import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO describing an active session (one logged-in device) of the current user.
 */
export class SessionResponseDto {
  @ApiProperty({
    description:
      'Session ID. Pass it to DELETE /auth/sessions/{id} to revoke this device. The ID changes every time the device refreshes its tokens.',
    example: '3f1c2a9e-8b7d-4c2e-9f1a-1b2c3d4e5f60',
  })
  id: string;

  @ApiProperty({
    description: 'User-Agent of the client that created or last refreshed the session.',
    example: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    nullable: true,
    type: String,
  })
  deviceInfo: string | null;

  @ApiProperty({
    description: 'IP address of the client that created or last refreshed the session.',
    example: '203.0.113.42',
    nullable: true,
    type: String,
  })
  ipAddress: string | null;

  @ApiProperty({
    description: 'When the current refresh token of this session was issued.',
    example: '2026-02-13T10:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'When the current refresh token of this session expires.',
    example: '2026-02-20T10:00:00.000Z',
  })
  expiresAt: string;
}
