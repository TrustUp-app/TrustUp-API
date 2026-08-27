import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { SubmitTransactionRequestDto } from './dto/submit-transaction-request.dto';
import { SubmitTransactionResponseDto } from './dto/submit-transaction-response.dto';
import { TransactionStatusResponseDto } from './dto/transaction-status-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  private static readonly TRANSACTION_HASH_REGEX = /^[a-f0-9]{64}$/i;

  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit a signed XDR transaction to the Stellar network',
    description:
      'Validates the XDR format, submits the signed transaction to the Stellar network via Horizon API, stores the transaction hash with pending status in the database, and returns the hash immediately without waiting for confirmation.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction submitted successfully — hash returned with pending status',
    type: SubmitTransactionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Malformed XDR, invalid signature, or Stellar rejection',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - missing or invalid JWT' })
  @ApiResponse({ status: 503, description: 'Stellar network temporarily unavailable' })
  async submitTransaction(
    @CurrentUser() user: { wallet: string },
    @Body() dto: SubmitTransactionRequestDto,
  ): Promise<{ success: boolean; data: SubmitTransactionResponseDto; message: string }> {
    const data = await this.transactionsService.submitTransaction(user.wallet, dto);
    return {
      success: true,
      data,
      message: 'Transaction submitted successfully',
    };
  }

  @Get(':hash')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get Stellar transaction status by hash',
    description:
      'Looks up a Stellar transaction in Horizon, normalizes its status to pending/success/failed, and returns cached finalized results when available. This endpoint is public and does not require authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction status retrieved successfully',
    type: TransactionStatusResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid transaction hash format' })
  @ApiResponse({ status: 404, description: 'Transaction hash not found' })
  @ApiResponse({ status: 503, description: 'Horizon API temporarily unavailable' })
  async getTransactionStatus(
    @Param('hash') hash: string,
  ): Promise<{ success: boolean; data: TransactionStatusResponseDto; message: string }> {
    if (!TransactionsController.TRANSACTION_HASH_REGEX.test(hash)) {
      throw new BadRequestException({
        code: 'TRANSACTION_INVALID_HASH',
        message: 'Transaction hash must be a 64-character hexadecimal string.',
      });
    }

    const data = await this.transactionsService.getTransactionStatus(hash);

    return {
      success: true,
      data,
      message: 'Transaction status retrieved successfully',
    };
  }
}
