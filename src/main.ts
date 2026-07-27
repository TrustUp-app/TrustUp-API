import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyHelmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger';

const BANNER = `
████████╗██████╗ ██╗   ██╗███████╗████████╗    ██╗   ██╗██████╗ 
╚══██╔══╝██╔══██╗██║   ██║██╔════╝╚══██╔══╝    ██║   ██║██╔══██╗
   ██║   ██████╔╝██║   ██║███████╗   ██║       ██║   ██║██████╔╝
   ██║   ██╔══██╗██║   ██║╚════██║   ██║       ██║   ██║██╔═══╝ 
   ██║   ██║  ██║╚██████╔╝███████║   ██║       ╚██████╔╝██║     
   ╚═╝   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝        ╚═════╝ ╚═╝       
      
    ------  𝔹𝕦𝕪 𝕟𝕠𝕨 𝕡𝕒𝕪 𝕝𝕒𝕥𝕖𝕣  𝕨𝕚𝕥𝕙𝕠𝕦𝕥 𝕓𝕒𝕟𝕜𝕤 ------  𝔹
  
`;

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 4000);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  // Security HTTP headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `'unsafe-inline'`, `'unsafe-eval'`],
      },
    },
  });

  // CORS configuration
  const origin = corsOrigin === '*'
    ? '*'
    : corsOrigin.split(',').map((item) => item.trim());

  app.enableCors({
    origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Mount Swagger UI in non-production environments
  if (nodeEnv !== 'production') {
    setupSwagger(app);
  }

  await app.listen(port, '0.0.0.0');

  console.log(BANNER);
  console.log(`🚀 Server is running on: http://localhost:${port}/${apiPrefix}`);
  console.log(`📚 Environment: ${nodeEnv}`);
  if (nodeEnv !== 'production') {
    console.log(`📑 Swagger Documentation: http://localhost:${port}/docs`);
  }
  console.log(`⏰ Started at: ${new Date().toISOString()}\n`);
}

bootstrap();
