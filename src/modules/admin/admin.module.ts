import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthModule } from '../auth/auth.module';
import { SupabaseService } from '../../database/supabase.client';
import { UsersRepository } from '../../database/repositories/users.repository';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [AdminService, SupabaseService, UsersRepository],
})
export class AdminModule {}
