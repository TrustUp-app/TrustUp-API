import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ConfigModule } from '@nestjs/config';
import { AdminModule } from '../../../../src/modules/admin/admin.module';
import { AdminService } from '../../../../src/modules/admin/admin.service';
import { JwtAuthGuard } from '../../../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../../src/common/guards/roles.guard';
import { UserRole } from '../../../../src/common/enums/user-role.enum';

import { SupabaseService } from '../../../../src/database/supabase.client';

describe('AdminController (e2e)', () => {
  let app: NestFastifyApplication;

  const mockSupabaseService = {
    getServiceRoleClient: jest.fn(),
    getClient: jest.fn(),
  };

  const adminWallet = 'GAADMIN777777777777777777777777777777777777777777777777777';
  const borrowerWallet = 'GBORROWER111111111111111111111111111111111111111111111111';
  const targetUserId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const targetAppId = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const targetLoanId = 'c1b2c3d4-e5f6-7890-abcd-ef1234567890';

  const mockAdminService = {
    updateUserRole: jest.fn().mockResolvedValue({
      id: targetUserId,
      walletAddress: borrowerWallet,
      role: UserRole.MERCHANT,
    }),
    getSystemHealth: jest.fn().mockResolvedValue({
      status: 'ok',
      uptime: 1000,
      timestamp: '2026-08-27T10:00:00.000Z',
      database: 'connected',
      redis: 'connected',
      stellarNetwork: 'connected',
      version: '0.1.0',
    }),
    listMerchantApplications: jest.fn().mockResolvedValue({
      applications: [
        {
          id: targetAppId,
          wallet: borrowerWallet,
          name: 'TechStore',
          status: 'pending',
          createdAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    }),
    approveMerchant: jest.fn().mockResolvedValue({
      applicationId: targetAppId,
      wallet: borrowerWallet,
      status: 'approved',
      message: 'Merchant application has been approved and activated.',
      merchantId: 'merchant-uuid-1',
    }),
    overrideLoan: jest.fn().mockResolvedValue({
      loanId: targetLoanId,
      previousStatus: 'active',
      status: 'completed',
      action: 'FORCE_SETTLE',
      reason: 'Off-chain settlement confirmed',
      overriddenBy: adminWallet,
      timestamp: '2026-08-27T10:00:00.000Z',
    }),
  };

  let mockCurrentRole: UserRole = UserRole.ADMIN;

  const mockJwtAuthGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      const authHeader = req.headers['authorization'];
      if (!authHeader?.startsWith('Bearer ')) {
        throw new UnauthorizedException('No token provided');
      }
      req.user = {
        wallet: mockCurrentRole === UserRole.ADMIN ? adminWallet : borrowerWallet,
        role: mockCurrentRole,
      };
      return true;
    }),
  };

  const mockRolesGuard = {
    canActivate: jest.fn((context) => {
      const req = context.switchToHttp().getRequest();
      if (!req.user || req.user.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Admin role required');
      }
      return true;
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ JWT_SECRET: 'test-jwt-secret-for-e2e-testing-purposes-12345' })],
        }),
        AdminModule,
      ],
    })

      .overrideProvider(AdminService)
      .useValue(mockAdminService)
      .overrideProvider(SupabaseService)
      .useValue(mockSupabaseService)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(() => {
    mockCurrentRole = UserRole.ADMIN;
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // PATCH /admin/users/:id/role
  // ---------------------------------------------------------------------------
  describe('PATCH /admin/users/:id/role', () => {
    it('should return 200 with updated role when admin requests', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/users/${targetUserId}/role`,
        headers: { authorization: 'Bearer admin.jwt.token' },
        payload: { role: UserRole.MERCHANT },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.role).toBe(UserRole.MERCHANT);
      expect(mockAdminService.updateUserRole).toHaveBeenCalledWith(targetUserId, UserRole.MERCHANT);
    });

    it('should return 403 when non-admin user requests', async () => {
      mockCurrentRole = UserRole.BORROWER;

      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/users/${targetUserId}/role`,
        headers: { authorization: 'Bearer borrower.jwt.token' },
        payload: { role: UserRole.MERCHANT },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /admin/system/health
  // ---------------------------------------------------------------------------
  describe('GET /admin/system/health', () => {
    it('should return 200 with system diagnostics for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/system/health',
        headers: { authorization: 'Bearer admin.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('ok');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /admin/merchants/applications
  // ---------------------------------------------------------------------------
  describe('GET /admin/merchants/applications', () => {
    it('should return 200 with applications list for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/merchants/applications?status=pending&limit=10&offset=0',
        headers: { authorization: 'Bearer admin.jwt.token' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.applications).toHaveLength(1);
      expect(mockAdminService.listMerchantApplications).toHaveBeenCalledWith('pending', 10, 0);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH /admin/merchants/:id/approve
  // ---------------------------------------------------------------------------
  describe('PATCH /admin/merchants/:id/approve', () => {
    it('should return 200 when admin approves application', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/admin/merchants/${targetAppId}/approve`,
        headers: { authorization: 'Bearer admin.jwt.token' },
        payload: { approved: true },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('approved');
      expect(mockAdminService.approveMerchant).toHaveBeenCalledWith(
        targetAppId,
        { approved: true },
        adminWallet,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // POST /admin/loans/:id/override
  // ---------------------------------------------------------------------------
  describe('POST /admin/loans/:id/override', () => {
    it('should return 200 when admin overrides loan status', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/loans/${targetLoanId}/override`,
        headers: { authorization: 'Bearer admin.jwt.token' },
        payload: {
          targetStatus: 'completed',
          reason: 'Off-chain settlement confirmed',
          action: 'FORCE_SETTLE',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('completed');
      expect(mockAdminService.overrideLoan).toHaveBeenCalledWith(
        targetLoanId,
        {
          targetStatus: 'completed',
          reason: 'Off-chain settlement confirmed',
          action: 'FORCE_SETTLE',
        },
        adminWallet,
      );
    });

    it('should return 400 when invalid targetStatus is provided', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/admin/loans/${targetLoanId}/override`,
        headers: { authorization: 'Bearer admin.jwt.token' },
        payload: {
          targetStatus: 'invalid_status',
          reason: 'Some justification note',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
