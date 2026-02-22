import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from '../../database/repositories/users.repository';
import { SupabaseService } from '../../database/supabase.client';

/**
 * Users feature module.
 *
 * Note: JwtAuthGuard is NOT listed as a provider here — it lives in AuthModule
 * (created in API-03) and is resolved from there by NestJS's DI container.
 */
@Module({
    controllers: [UsersController],
    providers: [UsersService, UsersRepository, SupabaseService],
    exports: [UsersService],
})
export class UsersModule { }
