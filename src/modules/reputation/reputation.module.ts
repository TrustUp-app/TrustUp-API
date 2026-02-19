import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReputationController } from './reputation.controller';
import { ReputationService } from './reputation.service';
import { SupabaseService } from '../../database/supabase.client';
import { SorobanService } from '../../blockchain/soroban/soroban.service';
import { ReputationContractClient } from '../../blockchain/contracts/reputation-contract.client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [ReputationController],
  providers: [
    ReputationService,
    SupabaseService,
    SorobanService,
    ReputationContractClient,
    JwtAuthGuard,
  ],
  exports: [ReputationService],
})
export class ReputationModule {}
