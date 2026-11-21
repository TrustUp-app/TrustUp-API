import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import * as request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '../../../../src/modules/auth/auth.module';
import { UsersModule } from '../../../../src/modules/users/users.module';
import { HealthModule } from '../../../../src/modules/health/health.module';
import { SupabaseService } from '../../../../src/database/supabase.client';
import { createTestKeypair, signMessage } from '../../../helpers';
import { createMockRegisterRequest } from '../../../fixtures';

describe('AuthController (e2e)', () => {
  let app: NestFastifyApplication;
  let supabaseService: SupabaseService;
  let testWallets: string[] = [];
  let testUsernames: string[] = [];

  beforeAll(async () => {
    // Set test environment variables
    process.env.JWT_SECRET = 'test_jwt_secret_for_e2e_testing_min_32_chars';
    process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_for_e2e_testing_min_32_chars';
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'test_anon_key';
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'test_service_role_key';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, UsersModule, HealthModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    supabaseService = app.get(SupabaseService);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clean up test data
    const client = supabaseService.getServiceRoleClient();

    // Clean up nonces
    if (testWallets.length > 0) {
      await client.from('nonces').delete().in('wallet_address', testWallets);
    }

    // Clean up users
    if (testWallets.length > 0) {
      await client.from('users').delete().in('wallet_address', testWallets);
    }

    // Clean up sessions
    if (testWallets.length > 0) {
      const userIds = await client.from('users').select('id').in('wallet_address', testWallets);

      if (userIds.data && userIds.data.length > 0) {
        const ids = userIds.data.map((u) => u.id);
        await client.from('sessions').delete().in('user_id', ids);
      }
    }

    // Clean up usernames from users table
    if (testUsernames.length > 0) {
      await client.from('users').delete().in('username', testUsernames);
    }

    // Reset test data arrays
    testWallets = [];
    testUsernames = [];
  });

  describe('POST /auth/nonce', () => {
    it('should return nonce and expiresAt with valid wallet', async () => {
      const wallet = createTestKeypair().publicKey();
      testWallets.push(wallet);

      const response = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      expect(response.body).toHaveProperty('nonce');
      expect(response.body).toHaveProperty('expiresAt');
      expect(typeof response.body.nonce).toBe('string');
      expect(response.body.nonce).toHaveLength(64);
      expect(new Date(response.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should return 400 with invalid wallet format (too short)', async () => {
      await request(app.getHttpServer()).post('/auth/nonce').send({ wallet: 'G123' }).expect(400);
    });

    it('should return 400 with invalid wallet format (does not start with G)', async () => {
      await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet: 'XABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW' })
        .expect(400);
    });

    it('should return 400 with empty wallet', async () => {
      await request(app.getHttpServer()).post('/auth/nonce').send({ wallet: '' }).expect(400);
    });

    it('should return 400 with missing wallet field', async () => {
      await request(app.getHttpServer()).post('/auth/nonce').send({}).expect(400);
    });

    it('should return 400 with additional non-whitelisted fields', async () => {
      const wallet = createTestKeypair().publicKey();
      testWallets.push(wallet);

      await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet, extra: 'field' })
        .expect(400);
    });
  });

  describe('POST /auth/verify', () => {
    it('should return 400 with empty body', async () => {
      await request(app.getHttpServer()).post('/auth/verify').send({}).expect(400);
    });

    it('should return 400 with invalid wallet format', async () => {
      const nonce = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
      const signature = Buffer.alloc(64).toString('base64');

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet: 'INVALID', nonce, signature })
        .expect(400);
    });

    it('should return 400 with malformed nonce (too short)', async () => {
      const wallet = createTestKeypair().publicKey();
      const signature = Buffer.alloc(64).toString('base64');

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce: 'tooshort', signature })
        .expect(400);
    });

    it('should return 400 with missing signature field', async () => {
      const wallet = createTestKeypair().publicKey();
      const nonce = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';

      await request(app.getHttpServer()).post('/auth/verify').send({ wallet, nonce }).expect(400);
    });

    it('should return 401 when nonce does not exist in database', async () => {
      const wallet = createTestKeypair().publicKey();
      const nonce = 'a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef1234567890';
      const signature = Buffer.alloc(64).toString('base64');

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature })
        .expect(401);
    });

    it('should return 401 with invalid signature', async () => {
      const wallet = createTestKeypair().publicKey();
      testWallets.push(wallet);

      // First get a nonce
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      const nonce = nonceResponse.body.nonce;
      const invalidSignature = Buffer.alloc(64).toString('base64');

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature: invalidSignature })
        .expect(401);
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should complete full auth flow: nonce → verify → JWT tokens', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();
      testWallets.push(wallet);

      // Step 1: Request nonce
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      const nonce = nonceResponse.body.nonce;
      expect(nonce).toHaveLength(64);

      // Step 2: Sign nonce and verify
      const signature = signMessage(keypair, nonce);
      const verifyResponse = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature })
        .expect(200);

      // Should return JWT tokens
      expect(verifyResponse.body).toHaveProperty('accessToken');
      expect(verifyResponse.body).toHaveProperty('refreshToken');
      expect(verifyResponse.body).toHaveProperty('expiresIn');
      expect(verifyResponse.body).toHaveProperty('tokenType', 'Bearer');

      const { accessToken } = verifyResponse.body;

      // Step 3: Use JWT token in protected endpoint
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should prevent replay attacks with used nonces', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();
      testWallets.push(wallet);

      // Get nonce
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      const nonce = nonceResponse.body.nonce;
      const signature = signMessage(keypair, nonce);

      // First verify should succeed
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature })
        .expect(200);

      // Second verify with same nonce should fail
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature })
        .expect(401);
    });
  });

  describe('POST /auth/register', () => {
    it('should register new user and return JWT tokens', async () => {
      const registerData = createMockRegisterRequest();
      testWallets.push(registerData.walletAddress);
      testUsernames.push(registerData.username);

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(registerData)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('walletAddress', registerData.walletAddress);
      expect(response.body.user).toHaveProperty('username', registerData.username);
      expect(response.body.user).toHaveProperty('displayName', registerData.displayName);

      const { accessToken } = response.body;

      // Test auto-login with JWT
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('should return 409 when wallet address already exists', async () => {
      const registerData = createMockRegisterRequest();
      testWallets.push(registerData.walletAddress);
      testUsernames.push(registerData.username);

      // Register first time
      await request(app.getHttpServer()).post('/auth/register').send(registerData).expect(201);

      // Try to register again with same wallet
      const duplicateData = createMockRegisterRequest({
        walletAddress: registerData.walletAddress,
        username: `different_${Date.now()}`,
      });
      testUsernames.push(duplicateData.username);

      await request(app.getHttpServer()).post('/auth/register').send(duplicateData).expect(409);
    });

    it('should return 409 when username already exists', async () => {
      const registerData = createMockRegisterRequest();
      testWallets.push(registerData.walletAddress);
      testUsernames.push(registerData.username);

      // Register first time
      await request(app.getHttpServer()).post('/auth/register').send(registerData).expect(201);

      // Try to register again with same username
      const duplicateData = createMockRegisterRequest({
        walletAddress: createTestKeypair().publicKey(),
        username: registerData.username,
      });
      testWallets.push(duplicateData.walletAddress);

      await request(app.getHttpServer()).post('/auth/register').send(duplicateData).expect(409);
    });

    it('should return 400 with invalid wallet format', async () => {
      const invalidData = createMockRegisterRequest({
        walletAddress: 'INVALID_WALLET',
      });

      await request(app.getHttpServer()).post('/auth/register').send(invalidData).expect(400);
    });

    it('should return 400 with invalid username format', async () => {
      const invalidData = createMockRegisterRequest({
        username: 'invalid username with spaces',
      });
      testWallets.push(invalidData.walletAddress);

      await request(app.getHttpServer()).post('/auth/register').send(invalidData).expect(400);
    });

    it('should return 400 when terms not accepted', async () => {
      const invalidData = createMockRegisterRequest({
        termsAccepted: 'false',
      });
      testWallets.push(invalidData.walletAddress);
      testUsernames.push(invalidData.username);

      await request(app.getHttpServer()).post('/auth/register').send(invalidData).expect(400);
    });
  });

  describe('Database State Validation', () => {
    it('should create user record in database after successful registration', async () => {
      const registerData = createMockRegisterRequest();
      testWallets.push(registerData.walletAddress);
      testUsernames.push(registerData.username);

      await request(app.getHttpServer()).post('/auth/register').send(registerData).expect(201);

      // Verify database state
      const client = supabaseService.getServiceRoleClient();
      const { data: user } = await client
        .from('users')
        .select('*')
        .eq('wallet_address', registerData.walletAddress)
        .single();

      expect(user).toBeTruthy();
      expect(user.username).toBe(registerData.username);
      expect(user.display_name).toBe(registerData.displayName);
    });

    it('should create nonce record in database after nonce request', async () => {
      const wallet = createTestKeypair().publicKey();
      testWallets.push(wallet);

      const response = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      // Verify database state
      const client = supabaseService.getServiceRoleClient();
      const { data: nonce } = await client
        .from('nonces')
        .select('*')
        .eq('wallet_address', wallet)
        .eq('nonce', response.body.nonce)
        .single();

      expect(nonce).toBeTruthy();
      expect(nonce.used_at).toBeNull();
      expect(new Date(nonce.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('should mark nonce as used after successful verification', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();
      testWallets.push(wallet);

      // Get nonce
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      const nonce = nonceResponse.body.nonce;
      const signature = signMessage(keypair, nonce);

      // Verify
      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature })
        .expect(200);

      // Verify database state
      const client = supabaseService.getServiceRoleClient();
      const { data: nonceRecord } = await client
        .from('nonces')
        .select('*')
        .eq('wallet_address', wallet)
        .eq('nonce', nonce)
        .single();

      expect(nonceRecord.used_at).toBeTruthy();
    });

    it('should create session record after successful authentication', async () => {
      const keypair = createTestKeypair();
      const wallet = keypair.publicKey();
      testWallets.push(wallet);

      // Complete auth flow
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      const nonce = nonceResponse.body.nonce;
      const signature = signMessage(keypair, nonce);

      await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature })
        .expect(200);

      // Verify database state
      const client = supabaseService.getServiceRoleClient();
      const { data: user } = await client
        .from('users')
        .select('id')
        .eq('wallet_address', wallet)
        .single();

      const { data: session } = await client
        .from('sessions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      expect(session).toBeTruthy();
      expect(session.refresh_token_hash).toBeTruthy();
      expect(new Date(session.expires_at).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Refresh and Logout Flows (E2E)', () => {
    let wallet: string;
    let keypair: any;
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      keypair = createTestKeypair();
      wallet = keypair.publicKey();
      testWallets.push(wallet);

      // Authenticate to get initial tokens
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);

      const nonce = nonceResponse.body.nonce;
      const signature = signMessage(keypair, nonce);

      const verifyResponse = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature })
        .expect(200);

      accessToken = verifyResponse.body.accessToken;
      refreshToken = verifyResponse.body.refreshToken;
    });

    it('POST /auth/refresh - should refresh tokens successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.expiresIn).toBe(900);
      expect(response.body.tokenType).toBe('Bearer');

      // Verify the new access token works
      await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${response.body.accessToken}`)
        .expect(200);

      // Verify the old refresh token is rotated (deleted) and no longer works
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('POST /auth/refresh - should return 400 when body is empty', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(400);
    });

    it('POST /auth/refresh - should return 400 when refreshToken is empty', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: '' })
        .expect(400);
    });

    it('POST /auth/refresh - should return 400 when extra fields are provided', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken, extraField: 'invalid' })
        .expect(400);
    });

    it('POST /auth/refresh - should return 401 with invalid refresh token signature', async () => {
      const invalidToken = refreshToken + 'invalid';
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: invalidToken })
        .expect(401);
    });

    it('DELETE /auth/logout - should log out successfully and revoke refresh token', async () => {
      await request(app.getHttpServer()).delete('/auth/logout').send({ refreshToken }).expect(204);

      // Verify the refresh token is now revoked
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('DELETE /auth/logout - should return 400 when body is empty', async () => {
      await request(app.getHttpServer()).delete('/auth/logout').send({}).expect(400);
    });

    it('DELETE /auth/logout - should return 401 with invalid token signature', async () => {
      const invalidToken = refreshToken + 'invalid';
      await request(app.getHttpServer())
        .delete('/auth/logout')
        .send({ refreshToken: invalidToken })
        .expect(401);
    });

    it('POST /auth/refresh - should keep the rotated session row instead of overwriting it', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(200);

      const client = supabaseService.getServiceRoleClient();
      const { data: user } = await client
        .from('users')
        .select('id')
        .eq('wallet_address', wallet)
        .single();
      const { data: sessions } = await client
        .from('sessions')
        .select('token_family, revoked_at')
        .eq('user_id', user.id);

      expect(sessions).toHaveLength(2);
      expect(new Set(sessions.map((s) => s.token_family)).size).toBe(1);
      expect(sessions.filter((s) => s.revoked_at === null)).toHaveLength(1);
    });

    it('stolen refresh token replay - should revoke the whole token family', async () => {
      // Legitimate client rotates its token
      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      const legitimateRefreshToken = rotated.body.refreshToken;

      // Attacker replays the old (stolen) refresh token → reuse detected
      const replay = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);
      expect(JSON.stringify(replay.body)).toContain('AUTH_TOKEN_REVOKED');

      // The legitimate client's newest token has been revoked too
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: legitimateRefreshToken })
        .expect(401);
    });

    it('stolen refresh token replay - attacker token is revoked when the victim refreshes afterwards', async () => {
      // Attacker uses the stolen token first
      const attacker = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Victim presents the same (now rotated) token → reuse detected
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);

      // The attacker's freshly issued refresh token no longer works
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: attacker.body.refreshToken })
        .expect(401);
    });

    it('token reuse in one session should not affect other devices', async () => {
      // Second device logs in
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);
      const nonce = nonceResponse.body.nonce;
      const secondDevice = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({ wallet, nonce, signature: signMessage(keypair, nonce) })
        .expect(200);

      // Reuse on the first device
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(200);
      await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);

      // Second device keeps working
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: secondDevice.body.refreshToken })
        .expect(200);
    });
  });

  describe('Session Management (E2E)', () => {
    let wallet: string;
    let keypair: any;

    async function login(userAgent: string) {
      const nonceResponse = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ wallet })
        .expect(201);
      const nonce = nonceResponse.body.nonce;
      const response = await request(app.getHttpServer())
        .post('/auth/verify')
        .set('User-Agent', userAgent)
        .send({ wallet, nonce, signature: signMessage(keypair, nonce) })
        .expect(200);
      return response.body as { accessToken: string; refreshToken: string };
    }

    beforeEach(() => {
      keypair = createTestKeypair();
      wallet = keypair.publicKey();
      testWallets.push(wallet);
    });

    it('GET /auth/sessions - should return 401 without an access token', async () => {
      await request(app.getHttpServer()).get('/auth/sessions').expect(401);
    });

    it('GET /auth/sessions - should list one active session per device with device info', async () => {
      const phone = await login('TrustUp-Test/Phone');
      await login('TrustUp-Test/Laptop');

      // Rotating a token must not add a second entry for the same device
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('User-Agent', 'TrustUp-Test/Phone')
        .send({ refreshToken: phone.refreshToken })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.map((s: any) => s.deviceInfo).sort()).toEqual([
        'TrustUp-Test/Laptop',
        'TrustUp-Test/Phone',
      ]);
      for (const session of response.body) {
        expect(session).toHaveProperty('id');
        expect(session).toHaveProperty('ipAddress');
        expect(session).toHaveProperty('createdAt');
        expect(session).toHaveProperty('expiresAt');
        expect(session).not.toHaveProperty('refreshTokenHash');
      }
    });

    it('DELETE /auth/sessions/:id - should revoke only that device', async () => {
      const phone = await login('TrustUp-Test/Phone');
      const laptop = await login('TrustUp-Test/Laptop');

      const list = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(200);
      const laptopSession = list.body.find((s: any) => s.deviceInfo === 'TrustUp-Test/Laptop');

      await request(app.getHttpServer())
        .delete(`/auth/sessions/${laptopSession.id}`)
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: laptop.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: phone.refreshToken })
        .expect(200);
    });

    it('DELETE /auth/sessions/:id - should return 404 for an unknown session', async () => {
      const phone = await login('TrustUp-Test/Phone');

      await request(app.getHttpServer())
        .delete('/auth/sessions/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(404);
    });

    it('DELETE /auth/sessions/:id - should return 400 for a non-UUID id', async () => {
      const phone = await login('TrustUp-Test/Phone');

      await request(app.getHttpServer())
        .delete('/auth/sessions/not-a-uuid')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(400);
    });

    it('DELETE /auth/sessions - should log out from all devices', async () => {
      const phone = await login('TrustUp-Test/Phone');
      const laptop = await login('TrustUp-Test/Laptop');

      await request(app.getHttpServer())
        .delete('/auth/sessions')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: phone.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: laptop.refreshToken })
        .expect(401);

      const list = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${phone.accessToken}`)
        .expect(200);
      expect(list.body).toHaveLength(0);
    });
  });
});
