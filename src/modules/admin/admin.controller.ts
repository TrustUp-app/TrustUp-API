import {
  Controller,
  Patch,
  Post,
  Get,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UpdateUserRoleDto, UpdateUserRoleResponseDto } from './dto/update-user-role.dto';
import { ApproveMerchantDto, ApproveMerchantResponseDto } from './dto/approve-merchant.dto';
import { OverrideLoanDto, OverrideLoanResponseDto } from './dto/override-loan.dto';
import { ListMerchantApplicationsQueryDto } from './dto/list-merchant-applications-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Admin-only controller for platform management operations.
 *
 * All endpoints require admin role. Provides:
 * - User role management
 * - Loan override state machine execution
 * - Merchant application review & approval
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
  @ApiParam({
    name: 'id',
    description: 'User UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOperation({
    summary: "Update a user's role",
    description:
      'Changes the role of a user identified by their UUID. Admin only. Roles: admin, merchant, lp_provider, borrower.',
  })
  @ApiResponse({
    status: 200,
    description: 'User role updated successfully',
    type: UpdateUserRoleResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid role value' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUserRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserRoleDto) {
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
    description:
      'Returns comprehensive system diagnostics including uptime, database status, Redis status, and Stellar network connectivity. Admin only.',
  })
  @ApiResponse({ status: 200, description: 'System health retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async getSystemHealth() {
    const data = await this.adminService.getSystemHealth();
    return { success: true, data, message: 'System health retrieved successfully' };
  }

  /**
   * GET /admin/merchants/applications
   * List merchant applications with optional status filter. Admin only.
   */
  @Get('merchants/applications')
  @ApiOperation({
    summary: 'List merchant applications',
    description:
      'Returns paginated merchant applications submitted for onboarding review. Admin only.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'approved', 'rejected'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Merchant applications retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  async listMerchantApplications(@Query() query: ListMerchantApplicationsQueryDto) {
    const data = await this.adminService.listMerchantApplications(
      query.status,
      query.limit,
      query.offset,
    );
    return { success: true, data, message: 'Merchant applications retrieved successfully' };
  }

  /**
   * PATCH /admin/merchants/:id/approve
   * Approve or reject a merchant application. Admin only.
   */
  @Patch('merchants/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Merchant Application UUID or Merchant UUID' })
  @ApiOperation({
    summary: 'Approve or reject merchant application',
    description:
      'Approves or rejects a merchant application. On approval, creates/activates the merchant and updates user role to merchant. Admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Merchant approval status updated',
    type: ApproveMerchantResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Application already processed or invalid payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Merchant application not found' })
  async approveMerchant(
    @Param('id') id: string,
    @Body() dto: ApproveMerchantDto,
    @CurrentUser() user: { wallet: string },
  ) {
    const data = await this.adminService.approveMerchant(id, dto, user?.wallet);
    return { success: true, data, message: data.message };
  }

  /**
   * POST /admin/loans/:id/override
   * Override a loan's status following valid state transitions with audit trail. Admin only.
   */
  @Post('loans/:id/override')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Loan UUID or loan ID' })
  @ApiOperation({
    summary: 'Override loan status',
    description:
      'Forces a state machine transition on a loan record and saves an immutable audit log. Admin only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Loan status successfully overridden',
    type: OverrideLoanResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status transition, terminal status, or missing justification',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — admin role required' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  async overrideLoan(
    @Param('id') id: string,
    @Body() dto: OverrideLoanDto,
    @CurrentUser() user: { wallet: string },
  ) {
    const data = await this.adminService.overrideLoan(id, dto, user.wallet);
    return { success: true, data, message: 'Loan status overridden successfully' };
  }
}
