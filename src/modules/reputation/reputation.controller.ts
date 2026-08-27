import { Controller, Get, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { ReputationService } from './reputation.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { STELLAR_WALLET_REGEX } from '../../common/constants/stellar';

@ApiTags('Reputation')
@Controller('reputation')
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reputation score for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Reputation data retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT' })
  async getMyScore(@CurrentUser() user: { wallet: string }) {
    const data = await this.reputationService.getReputationScore(user.wallet);

    return {
      success: true,
      data,
      message: 'Your reputation data retrieved successfully',
    };
  }

  @Get(':wallet')
  @ApiOperation({ summary: 'Get reputation score for a specific wallet' })
  @ApiParam({
    name: 'wallet',
    description: 'Stellar wallet address (Ed25519 public key, G + 55 chars)',
    example: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
  })
  @ApiResponse({
    status: 200,
    description: 'Reputation data retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid Stellar wallet address format' })
  async getScore(@Param('wallet') wallet: string) {
    if (!STELLAR_WALLET_REGEX.test(wallet)) {
      throw new BadRequestException({
        success: false,
        message: 'Invalid Stellar wallet address format',
      });
    }

    const data = await this.reputationService.getReputationScore(wallet);

    return {
      success: true,
      data,
      message: 'Reputation data retrieved successfully',
    };
  }
}
