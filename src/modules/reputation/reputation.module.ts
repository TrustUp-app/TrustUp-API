import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ReputationService } from './reputation.service';
import { ReputationController } from './reputation.controller';
import * as redisStore from 'cache-manager-redis-store';
import { SupabaseService } from '../../database/supabase.client';
import { getJwtConfig } from '../../config/jwt.config';

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
      }),
    }),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getJwtConfig,
    }),
  ],
  providers: [ReputationService, SupabaseService],
  controllers: [ReputationController],
  exports: [ReputationService],
})
export class ReputationModule {}
