import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { SupabaseService } from '../../database/supabase.client';
import { UsersRepository } from '../../database/repositories/users.repository';
import { SessionsRepository } from '../../database/repositories/sessions.repository';
import { getJwtConfig } from '../../config/jwt.config';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getJwtConfig,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    SupabaseService,
    ConfigService,
    UsersRepository,
    SessionsRepository,
  ],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
