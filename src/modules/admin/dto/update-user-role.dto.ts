import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';

/**
 * Request DTO for updating a user's role.
 * Used by PATCH /admin/users/:id/role
 */
export class UpdateUserRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.MERCHANT,
    description: 'The new role to assign to the user',
  })
  @IsEnum(UserRole)
  role: UserRole;
}

/**
 * Response DTO for role update operations.
 */
export class UpdateUserRoleResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({
    example: {
      id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      walletAddress: 'GABC...XYZ',
      role: 'merchant',
    },
  })
  data: {
    id: string;
    walletAddress: string;
    role: UserRole;
  };

  @ApiProperty({ example: 'User role updated successfully' })
  message: string;
}
