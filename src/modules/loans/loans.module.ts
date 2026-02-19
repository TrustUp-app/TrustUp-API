import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';
import { ReputationModule } from '../reputation/reputation.module';
import { MerchantsModule } from '../merchants/merchants.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    ReputationModule,
    MerchantsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [LoansController],
  providers: [LoansService, JwtAuthGuard],
  exports: [LoansService],
})
export class LoansModule {}
