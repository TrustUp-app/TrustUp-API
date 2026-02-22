import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

/**
 * Handles HTTP requests to the /users resource.
 *
 * All endpoints are protected by JwtAuthGuard (implemented in API-03).
 * The @UseGuards decorator is kept explicit for clarity and works correctly
 * whether the guard is registered globally (APP_GUARD) or not.
 */
@ApiTags('users')
@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    /**
     * GET /users/me
     *
     * Returns the authenticated user's profile.
     * If this is the user's first request, a profile is auto-created.
     *
     * @param user - Injected by @CurrentUser() from req.user set by JwtAuthGuard
     */
    @Get('me')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: "Get the authenticated user's profile" })
    @ApiResponse({ status: 200, description: 'User profile retrieved', type: UserResponseDto })
    @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
    async getMe(@CurrentUser() user: { wallet: string }): Promise<UserResponseDto> {
        const data = await this.usersService.getOrCreateProfile(user.wallet);
        return {
            success: true,
            data,
            message: 'User retrieved successfully',
        };
    }
}
