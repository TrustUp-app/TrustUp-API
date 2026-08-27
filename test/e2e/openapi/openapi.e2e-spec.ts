import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { buildSwaggerDocument } from '../../../src/config/swagger';

describe('OpenAPI document generation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a document with at least one path', () => {
    const document = buildSwaggerDocument(app);
    expect(Object.keys(document.paths).length).toBeGreaterThan(0);
  });

  it('documents a 2xx response and a summary for every operation', () => {
    const document = buildSwaggerDocument(app);

    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!operation || typeof operation !== 'object' || !('responses' in operation)) {
          continue;
        }

        const label = `${method.toUpperCase()} ${path}`;
        if (!operation.summary) {
          throw new Error(`${label} is missing @ApiOperation summary`);
        }

        const statusCodes = Object.keys(operation.responses ?? {});
        const hasSuccessResponse = statusCodes.some((code) => code.startsWith('2'));
        if (!hasSuccessResponse) {
          throw new Error(`${label} is missing a documented 2xx @ApiResponse`);
        }
      }
    }
  });

  it('documents bearer auth security scheme used by protected routes', () => {
    const document = buildSwaggerDocument(app);
    expect(document.components?.securitySchemes).toHaveProperty('JWT-auth');
    expect(document.components?.securitySchemes).toHaveProperty('admin-key');
  });
});
