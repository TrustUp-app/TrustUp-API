import { ApiProperty } from '@nestjs/swagger';

/**
 * Public representation of an active session/device.
 * The refresh token hash is deliberately never exposed.
 */
export class SessionSummaryDto {
  @ApiProperty({
    description: 'Session identifier. Use with DELETE /auth/sessions/:id to revoke this device.',
    example: '3f1c2b4a-9d8e-4f7a-8b6c-1a2b3c4d5e6f',
  })
  id: string;

  @ApiProperty({
    description: 'User agent / device identifier captured when the session was created.',
    example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    nullable: true,
  })
  deviceInfo: string | null;

  @ApiProperty({
    description: 'IP address the session was created from.',
    example: '203.0.113.42',
    nullable: true,
  })
  ipAddress: string | null;

  @ApiProperty({
    description: 'ISO-8601 timestamp of when the session was created.',
    example: '2026-02-13T10:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp of when the session (refresh token) expires.',
    example: '2026-02-20T10:00:00.000Z',
  })
  expiresAt: string;
}
