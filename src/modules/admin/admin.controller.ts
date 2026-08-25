import {
  Controller,
  Patch,
  Post,
  Get,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Admin-only controller for platform management operations.
 *
 * All endpoints require admin role. Provides:
 * - User role management
 * - Loan override (stub)
 * - Merchant approval (stub)
 * - Detailed system health
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * PATCH /admin/users/:id/role
   * Update a user's role. Admin only.
   */
  @Patch('users/:id/role')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'User UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiOperation({
    summary: 'Update a user\'s role',
    description: 'Changes the role of a user identified by their UUID. Admin only. Roles: admin, merchant, lp_provider, borrower.',
  })
  @ApiResponse({ status: 200, description: 'User role updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid role value' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    const data = await this.adminService.updateUserRole(id, dto.role);
    return { success: true, data, message: 'User role updated successfully' };
  }

  /**
   * GET /admin/system/health
   * Detailed system health information. Admin only.
   */
  @Get('system/health')
  @ApiOperation({
    summary: 'Get detailed system health',
    description: 'Returns comprehensive system diagnostics including uptime, database status, Redis status, and Stellar network connectivity. Admin only.',
  })
  @ApiResponse({ status: 200, description: 'System health retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getSystemHealth() {
    const data = await this.adminService.getSystemHealth();
    return { success: true, data, message: 'System health retrieved successfully' };
  }

  /**
   * POST /admin/loans/:id/override
   * Override a loan's status. Admin only. (Stub implementation)
   */
  @Post('loans/:id/override')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiOperation({
    summary: 'Override loan status (stub)',
    description: 'Allows admins to force-override a loan status. This is a stub implementation — full logic will be added when the admin dashboard is built.',
  })
  @ApiResponse({ status: 200, description: 'Loan override initiated' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async overrideLoan(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminService.overrideLoan(id, 'override');
    return { success: true, data, message: 'Loan override initiated' };
  }

  /**
   * PATCH /admin/merchants/:id/approve
   * Approve a merchant application. Admin only. (Stub implementation)
   */
  @Patch('merchants/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Merchant UUID' })
  @ApiOperation({
    summary: 'Approve merchant application (stub)',
    description: 'Allows admins to approve or reject merchant applications. This is a stub implementation — full logic will be added when the merchant onboarding flow is built.',
  })
  @ApiResponse({ status: 200, description: 'Merchant approval status updated' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async approveMerchant(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.adminService.approveMerchant(id, true);
    return { success: true, data, message: 'Merchant approval status updated' };
  }
}
