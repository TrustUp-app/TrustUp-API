import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LoansService } from './loans.service';
import { LoanQuoteRequestDto } from './dto/loan-quote-request.dto';
import { LoanQuoteResponseDto } from './dto/loan-quote-response.dto';

@ApiTags('loans')
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post('quote')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Calculate loan quote',
    description:
      'Calculate loan terms (interest rate, repayment schedule, total cost) ' +
      'based on user reputation without creating an actual loan on-chain.',
  })
  @ApiResponse({ status: 200, description: 'Loan quote calculated', type: LoanQuoteResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input or amount exceeds credit limit' })
  @ApiResponse({ status: 401, description: 'Unauthorized – missing or invalid JWT' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getQuote(
    @CurrentUser('wallet') wallet: string,
    @Body() dto: LoanQuoteRequestDto,
  ): Promise<LoanQuoteResponseDto> {
    return this.loansService.calculateLoanQuote(wallet, dto);
  }
}
