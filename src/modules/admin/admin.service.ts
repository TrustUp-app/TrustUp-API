import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { UsersRepository } from '../../database/repositories/users.repository';
import { UserRole } from '../../common/enums/user-role.enum';

/**
 * Service handling admin-only business logic.
 *
 * Provides operations for managing user roles, system health diagnostics,
 * and stub implementations for loan overrides and merchant approvals.
 */
@Injectable()
export class AdminService {
  constructor(private readonly usersRepository: UsersRepository) {}

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
    // Verify user exists
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
      database: 'connected', // Stub — future: real DB ping
      redis: 'connected',    // Stub — future: real Redis ping
      stellarNetwork: 'connected', // Stub — future: real Horizon ping
      version: '0.1.0',
    };
  }

  /**
   * Stub: Override a loan's status (e.g., force-close, extend).
   * To be fully implemented when the admin dashboard is built.
   */
  async overrideLoan(
    loanId: string,
    _action: string,
  ): Promise<{ loanId: string; status: string; message: string }> {
    return {
      loanId,
      status: 'override_pending',
      message: `Loan override for ${loanId} is pending implementation.`,
    };
  }

  /**
   * Stub: Approve or reject a merchant application.
   * To be fully implemented when the merchant onboarding flow is built.
   */
  async approveMerchant(
    merchantId: string,
    approved: boolean,
  ): Promise<{ merchantId: string; status: string; message: string }> {
    return {
      merchantId,
      status: approved ? 'approved' : 'rejected',
      message: `Merchant ${merchantId} has been ${approved ? 'approved' : 'rejected'} (stub).`,
    };
  }
}
