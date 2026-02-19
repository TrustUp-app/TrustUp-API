import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module';
import { LoansModule } from './modules/loans/loans.module';
import { ReputationModule } from './modules/reputation/reputation.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    LoansModule,
    ReputationModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

