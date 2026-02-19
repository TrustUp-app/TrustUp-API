import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ReputationService } from './reputation.service';
import { ReputationResponseDto } from './dto/reputation-response.dto';

@ApiTags('reputation')
@Controller('reputation')
export class ReputationController {
  constructor(private readonly reputationService: ReputationService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get my reputation',
    description:
      'Retrieve the authenticated user\'s reputation score, tier, interest rate, ' +
      'and credit limit. Reads from the on-chain Reputation contract with a ' +
      'Supabase cache fallback.',
  })
  @ApiResponse({ status: 200, description: 'Reputation data returned', type: ReputationResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized – missing or invalid JWT' })
  async getMyReputation(
    @CurrentUser('wallet') wallet: string,
  ): Promise<ReputationResponseDto> {
    const data = await this.reputationService.getReputation(wallet);
    return {
      wallet: data.wallet,
      score: data.score,
      tier: data.tier,
      interestRate: data.interestRate,
      maxCredit: data.maxCredit,
      lastUpdated: data.lastUpdated,
    };
  }

  @Get(':wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get reputation by wallet',
    description:
      'Retrieve the reputation score for any Stellar wallet address. ' +
      'Reads from the on-chain Reputation contract with a Supabase cache fallback.',
  })
  @ApiParam({
    name: 'wallet',
    description: 'Stellar wallet address (G...)',
    example: 'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFG',
  })
  @ApiResponse({ status: 200, description: 'Reputation data returned', type: ReputationResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid wallet address format' })
  @ApiResponse({ status: 401, description: 'Unauthorized – missing or invalid JWT' })
  async getReputationByWallet(
    @Param('wallet') wallet: string,
  ): Promise<ReputationResponseDto> {
    const data = await this.reputationService.getReputation(wallet);
    return {
      wallet: data.wallet,
      score: data.score,
      tier: data.tier,
      interestRate: data.interestRate,
      maxCredit: data.maxCredit,
      lastUpdated: data.lastUpdated,
    };
  }
}
