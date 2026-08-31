import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../../../../src/modules/health/health.controller';
import { HealthService } from '../../../../src/modules/health/health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: HealthService;

  const mockHealthService = {
    check: jest.fn(),
    checkDatabase: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthService = module.get<HealthService>(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return health status', async () => {
      const expectedResult = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'TrustUp API',
      };

      mockHealthService.check.mockResolvedValue(expectedResult);

      const result = await controller.check();

      expect(result).toEqual(expectedResult);
      expect(healthService.check).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkDatabase', () => {
    it('should return database status', async () => {
      const expectedResult = {
        status: 'ok',
        database: 'connected',
        message: 'Successfully connected to Supabase',
        timestamp: new Date().toISOString(),
      };

      mockHealthService.checkDatabase.mockResolvedValue(expectedResult);

      const result = await controller.checkDatabase();

      expect(result).toEqual(expectedResult);
      expect(healthService.checkDatabase).toHaveBeenCalledTimes(1);
    });
  });
});
