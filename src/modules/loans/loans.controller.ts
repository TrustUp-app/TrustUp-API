import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiHeader,
} from '@nestjs/swagger';
import { LoansService } from './loans.service';
import { LoanQuoteRequestDto } from './dto/loan-quote-request.dto';
import { LoanQuoteResponseDto } from './dto/loan-quote-response.dto';
import { CreateLoanRequestDto } from './dto/create-loan-request.dto';
import { CreateLoanResponseDto } from './dto/create-loan-response.dto';
import { LoanPaymentRequestDto } from './dto/loan-payment-request.dto';
import { LoanPaymentResponseDto } from './dto/loan-payment-response.dto';
import { AvailableCreditResponseDto } from './dto/available-credit-response.dto';
import { LoanListQueryDto, LoanListStatusFilter } from './dto/loan-list-query.dto';
import { LoanListResponseDto } from './dto/loan-list-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor';

@ApiTags('loans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BORROWER, UserRole.ADMIN)
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Calculate loan quote',
    description:
      'Calculates loan terms (interest rate, repayment schedule, total cost) based on user reputation without creating an actual loan on-chain. Requires JWT authentication. Allowed roles: borrower, admin.',
  })
  @ApiResponse({
    status: 200,
    description: 'Loan quote calculated successfully',
    type: LoanQuoteResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input or amount exceeds credit limit' })
  @ApiResponse({ status: 401, description: 'Unauthorized - missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async getLoanQuote(@CurrentUser() user: { wallet: string }, @Body() dto: LoanQuoteRequestDto) {
    const data = await this.loansService.calculateLoanQuote(user.wallet, dto);
    return { success: true, data, message: 'Loan quote calculated successfully' };
  }

  @Get('my-loans')
  @ApiOperation({
    summary: 'List loans for the authenticated user',
    description:
      'Returns paginated loans for the authenticated user ordered by creation date (newest first). Supports filtering by active, completed, or defaulted status and includes merchant information plus payment summary fields. Allowed roles: borrower, admin.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: LoanListStatusFilter,
    description: 'Filter loans by status',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Page size (default 20, max 100)',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of records to skip (default 0)',
  })
  @ApiResponse({
    status: 200,
    description: 'User loans retrieved successfully',
    type: LoanListResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid status or pagination parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized - missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  async getMyLoans(@CurrentUser() user: { wallet: string }, @Query() query: LoanListQueryDto) {
    const data = await this.loansService.getMyLoans(user.wallet, query);
    return { success: true, ...data };
  }

  @Get('available-credit')
  @ApiOperation({
    summary: 'Get available credit for the authenticated user',
    description:
      'Reads the current reputation score from the reputation contract, sums outstanding balances from active loans, and returns the user borrowing capacity breakdown. Allowed roles: borrower, admin.',
  })
  @ApiResponse({
    status: 200,
    description: 'Available credit calculated successfully',
    type: AvailableCreditResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 503, description: 'Reputation contract temporarily unavailable' })
  async getAvailableCredit(@CurrentUser() user: { wallet: string }) {
    const data = await this.loansService.getAvailableCredit(user.wallet);
    return { success: true, data, message: 'Available credit calculated successfully' };
  }

  @Post('create')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID v4 key used to safely replay this request for 24 hours.',
  })
  @ApiOperation({
    summary: 'Create BNPL loan',
    description:
      'Creates a pending BNPL loan record and returns an unsigned Soroban XDR transaction for the authenticated user to sign. Allowed roles: borrower, admin.',
  })
  @ApiResponse({
    status: 200,
    description: 'Pending loan created and unsigned transaction generated successfully',
    type: CreateLoanResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input, insufficient reputation, or amount exceeds credit limit',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  @ApiResponse({ status: 500, description: 'Failed to construct XDR or persist pending loan' })
  async createLoan(
    @CurrentUser() user: { wallet: string },
    @Body() dto: CreateLoanRequestDto,
    @IdempotencyKey() _idempotencyKey?: string,
  ) {
    const data = await this.loansService.createLoan(user.wallet, dto);
    return { success: true, data, message: 'Pending loan created successfully' };
  }

  @Post(':loanId/pay')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'UUID v4 key used to safely replay this request for 24 hours.',
  })
  @ApiParam({
    name: 'loanId',
    description: 'UUID of the loan to repay',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiOperation({
    summary: 'Make a loan repayment',
    description:
      'Validates the payment, constructs an unsigned Soroban repay_loan() transaction, and returns it alongside a payment preview. The mobile app must sign the XDR and submit the signed transaction back to the network. Requires JWT authentication. Allowed roles: borrower, admin.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unsigned XDR transaction and payment preview returned successfully',
    type: LoanPaymentResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid payment amount or loan not active' })
  @ApiResponse({ status: 401, description: 'Unauthorized - missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Forbidden — insufficient role' })
  @ApiResponse({
    status: 404,
    description: 'Loan not found or does not belong to authenticated user',
  })
  @ApiResponse({ status: 503, description: 'Blockchain contract unavailable' })
  async repayLoan(
    @CurrentUser() user: { wallet: string },
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Body() dto: LoanPaymentRequestDto,
    @IdempotencyKey() _idempotencyKey?: string,
  ) {
    const data = await this.loansService.repayLoan(user.wallet, loanId, dto);
    return { success: true, data, message: 'Repayment transaction constructed successfully' };
  }
}
