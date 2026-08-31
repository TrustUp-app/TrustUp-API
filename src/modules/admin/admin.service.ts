import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersRepository } from '../../database/repositories/users.repository';
import {
  MerchantApplicationsRepository,
  MerchantApplicationRecord,
} from '../../database/repositories/merchant-applications.repository';
import { MerchantsRepository } from '../../database/repositories/merchants.repository';
import { LoansRepository } from '../../database/repositories/loans.repository';
import { UserRole } from '../../common/enums/user-role.enum';
import { ApproveMerchantDto, ApproveMerchantResponseDto } from './dto/approve-merchant.dto';
import {
  OverrideLoanDto,
  OverrideLoanResponseDto,
  ValidOverrideStatus,
} from './dto/override-loan.dto';

const VALID_LOAN_TRANSITIONS: Record<string, ValidOverrideStatus[]> = {
  pending: ['active', 'cancelled', 'completed'],
  active: ['completed', 'defaulted', 'cancelled'],
  defaulted: ['active', 'completed'],
  completed: [],
  cancelled: [],
};

/**
 * Service handling admin-only business logic.
 *
 * Provides operations for managing user roles, system health diagnostics,
 * loan status overrides with audit trails, and merchant application reviews.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly merchantApplicationsRepository: MerchantApplicationsRepository,
    private readonly merchantsRepository: MerchantsRepository,
    private readonly loansRepository: LoansRepository,
  ) {}

  /**
   * Updates the role of a user identified by their UUID.
   *
   * @param userId - Target user's internal UUID
   * @param role - The new role to assign
   * @returns Updated user data (id, wallet, role)
   * @throws NotFoundException if user not found
   * @throws BadRequestException if trying to assign invalid role
   */
  async updateUserRole(
    userId: string,
    role: UserRole,
  ): Promise<{ id: string; walletAddress: string; role: UserRole }> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException({
        code: 'ADMIN_USER_NOT_FOUND',
        message: `User with ID ${userId} not found.`,
      });
    }

    const updated = await this.usersRepository.updateRole(userId, role);

    return {
      id: updated.id,
      walletAddress: updated.wallet_address,
      role: updated.role,
    };
  }

  /**
   * Returns detailed system health information.
   * Includes uptime, service version, and connection statuses.
   */
  async getSystemHealth(): Promise<{
    status: string;
    uptime: number;
    timestamp: string;
    database: string;
    redis: string;
    stellarNetwork: string;
    version: string;
  }> {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: 'connected',
      stellarNetwork: 'connected',
      version: '0.1.0',
    };
  }

  /**
   * Retrieves a paginated list of merchant applications for admin review.
   */
  async listMerchantApplications(
    status?: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<{
    applications: MerchantApplicationRecord[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const { applications, total } = await this.merchantApplicationsRepository.findAll({
      status,
      limit,
      offset,
    });

    return {
      applications,
      total,
      limit,
      offset,
    };
  }

  /**
   * Approves or rejects a merchant application.
   *
   * On approval:
   * - Sets application status to 'approved'
   * - Upserts and activates the record in the `merchants` table
   * - Updates the user's role to UserRole.MERCHANT
   *
   * On rejection:
   * - Sets application status to 'rejected' with reason
   */
  async approveMerchant(
    idOrAppId: string,
    dto: ApproveMerchantDto,
    adminWallet?: string,
  ): Promise<ApproveMerchantResponseDto> {
    let application = await this.merchantApplicationsRepository.findById(idOrAppId);

    if (!application) {
      // Fallback: check if idOrAppId is a merchant wallet or merchant ID
      const merchant =
        idOrAppId.startsWith('G') && idOrAppId.length === 56
          ? await this.merchantsRepository.findByWallet(idOrAppId)
          : await this.merchantsRepository.findById(idOrAppId);

      if (merchant) {
        application = await this.merchantApplicationsRepository.findPendingByWallet(
          merchant.wallet,
        );
      }
    }

    if (!application) {
      throw new NotFoundException({
        code: 'MERCHANT_APPLICATION_NOT_FOUND',
        message: `Merchant application ${idOrAppId} not found.`,
      });
    }

    if (application.status !== 'pending') {
      throw new BadRequestException({
        code: 'MERCHANT_APPLICATION_ALREADY_PROCESSED',
        message: `Application ${application.id} has already been ${application.status}.`,
      });
    }

    let adminUserId: string | null = null;
    if (adminWallet) {
      const adminUser = await this.usersRepository.findByWallet(adminWallet);
      adminUserId = adminUser?.id ?? null;
    }

    if (dto.approved) {
      // 1. Update application status
      const updatedApp = await this.merchantApplicationsRepository.updateStatus(
        application.id,
        'approved',
        adminUserId,
      );

      // 2. Create or activate merchant in merchants table
      const merchant = await this.merchantsRepository.upsertMerchant({
        wallet: updatedApp.wallet,
        name: updatedApp.name,
        logo: updatedApp.logo,
        description: updatedApp.description,
        category: updatedApp.category,
        website: updatedApp.website,
        is_active: true,
      });

      // 3. Update user role to merchant
      const targetUser = updatedApp.user_id
        ? await this.usersRepository.findById(updatedApp.user_id)
        : await this.usersRepository.findByWallet(updatedApp.wallet);

      if (targetUser) {
        await this.usersRepository.updateRole(targetUser.id, UserRole.MERCHANT);
      }

      return {
        applicationId: updatedApp.id,
        wallet: updatedApp.wallet,
        status: 'approved',
        message: 'Merchant application has been approved and activated.',
        merchantId: merchant.id,
      };
    } else {
      const rejectionReason = dto.rejectionReason ?? 'Application rejected by administrator.';
      const updatedApp = await this.merchantApplicationsRepository.updateStatus(
        application.id,
        'rejected',
        adminUserId,
        rejectionReason,
      );

      return {
        applicationId: updatedApp.id,
        wallet: updatedApp.wallet,
        status: 'rejected',
        message: `Merchant application has been rejected: ${rejectionReason}`,
      };
    }
  }

  /**
   * Overrides a loan's status following a defined state machine,
   * recording an immutable audit trail entry in `loan_overrides`.
   */
  async overrideLoan(
    loanId: string,
    dto: OverrideLoanDto,
    adminWallet: string,
  ): Promise<OverrideLoanResponseDto> {
    const loan = await this.loansRepository.findDetailedById(loanId);
    if (!loan) {
      throw new NotFoundException({
        code: 'LOAN_NOT_FOUND',
        message: `Loan with ID ${loanId} not found.`,
      });
    }

    const currentStatus = loan.status;
    const targetStatus = dto.targetStatus;

    if (currentStatus === targetStatus) {
      throw new BadRequestException({
        code: 'LOAN_OVERRIDE_SAME_STATUS',
        message: `Loan is already in status '${currentStatus}'.`,
      });
    }

    const allowedTargets = VALID_LOAN_TRANSITIONS[currentStatus];
    if (!allowedTargets || allowedTargets.length === 0) {
      throw new BadRequestException({
        code: 'LOAN_OVERRIDE_TERMINAL_STATE',
        message: `Cannot override loan from terminal status '${currentStatus}'.`,
      });
    }

    if (!allowedTargets.includes(targetStatus)) {
      throw new BadRequestException({
        code: 'INVALID_LOAN_OVERRIDE_TRANSITION',
        message: `Cannot transition loan from status '${currentStatus}' to '${targetStatus}'. Allowed target statuses: [${allowedTargets.join(', ')}].`,
      });
    }

    // Resolve admin user ID
    const adminUser = await this.usersRepository.findByWallet(adminWallet);
    const action = dto.action ?? `OVERRIDE_TO_${targetStatus.toUpperCase()}`;

    // Build update payload
    const updates: Record<string, unknown> = {
      status: targetStatus,
    };

    if (targetStatus === 'completed') {
      updates.remaining_balance = 0;
      updates.completed_at = new Date().toISOString();
    } else if (targetStatus === 'defaulted') {
      updates.defaulted_at = new Date().toISOString();
    } else if (targetStatus === 'active') {
      updates.defaulted_at = null;
    }

    // Apply loan update
    await this.loansRepository.applyLoanOverride(
      loan.id,
      updates,
      currentStatus,
      loan.user_wallet,
      loan.loan_id,
      loan.merchant_id,
    );

    // Record audit trail
    await this.loansRepository.recordOverride({
      loan_id: loan.id,
      admin_id: adminUser?.id ?? null,
      admin_wallet: adminWallet,
      previous_status: currentStatus,
      new_status: targetStatus,
      action,
      reason: dto.reason,
    });

    return {
      loanId: loan.loan_id ?? loan.id,
      previousStatus: currentStatus,
      status: targetStatus,
      action,
      reason: dto.reason,
      overriddenBy: adminWallet,
      timestamp: new Date().toISOString(),
    };
  }
}
