import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { MerchantsService } from './merchants.service';
import { ListMerchantsQueryDto } from './dto/list-merchants-query.dto';
import { MerchantDetailDto } from './dto/merchant-detail.dto';
import { MerchantPortfolioQueryDto } from './dto/merchant-portfolio-query.dto';
import { MerchantPortfolioResponseDto } from './dto/merchant-portfolio-response.dto';
import { MerchantAnalyticsQueryDto } from './dto/merchant-analytics-query.dto';
import { MerchantAnalyticsResponseDto } from './dto/merchant-analytics-response.dto';
import { MerchantLeaderboardQueryDto, MerchantLeaderboardMetric } from './dto/merchant-leaderboard-query.dto';
import { MerchantLeaderboardResponseDto } from './dto/merchant-leaderboard-response.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Merchants')
@ApiBearerAuth()
@Controller('merchants')
export class MerchantsController {
    constructor(private readonly merchantsService: MerchantsService) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'List all active merchants with pagination' })
    @ApiResponse({
        status: 200,
        description: 'Active merchants retrieved successfully.',
    })
    @ApiResponse({ status: 401, description: 'Unauthorized — valid JWT required.' })
    async listMerchants(@Query() query: ListMerchantsQueryDto) {
        const limit = query.limit ?? 20;
        const offset = query.offset ?? 0;

        const data = await this.merchantsService.listMerchants(limit, offset);

        return {
            merchants: data.merchants,
            total: data.total,
            limit: data.limit,
            offset: data.offset,
        };
    }

    @Get('leaderboard')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get merchants ranked by a configurable metric' })
    @ApiQuery({ name: 'metric', required: false, enum: MerchantLeaderboardMetric, description: 'Metric used to rank merchants.' })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Page size (default 20, max 100)' })
    @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Number of records to skip (default 0)' })
    @ApiResponse({
        status: 200,
        description: 'Merchant leaderboard retrieved successfully.',
        type: MerchantLeaderboardResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized — valid JWT required.' })
    async getLeaderboard(@Query() query: MerchantLeaderboardQueryDto): Promise<MerchantLeaderboardResponseDto> {
        const metric = query.metric ?? MerchantLeaderboardMetric.VOLUME;
        const limit = query.limit ?? 20;
        const offset = query.offset ?? 0;

        return this.merchantsService.getLeaderboard(metric, limit, offset);
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get merchant details by ID or wallet address' })
    @ApiParam({
        name: 'id',
        description: 'Merchant unique ID (UUID) or Stellar wallet address starting with G.',
        example: 'GMER...',
    })
    @ApiResponse({
        status: 200,
        description: 'Merchant details retrieved successfully.',
        type: MerchantDetailDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized — valid JWT required.' })
    @ApiResponse({ status: 404, description: 'Merchant not found.' })
    async getMerchantById(@Param('id') id: string): Promise<MerchantDetailDto> {
        return this.merchantsService.getMerchantById(id);
    }

    @Get(':id/portfolio')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get a merchant loan portfolio (active loans, repayment rate, volume)' })
    @ApiParam({
        name: 'id',
        description: 'Merchant unique ID (UUID) or Stellar wallet address starting with G.',
        example: 'merchant-1',
    })
    @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Active loans page size (default 20, max 100)' })
    @ApiQuery({ name: 'offset', required: false, type: Number, description: 'Active loans records to skip (default 0)' })
    @ApiResponse({
        status: 200,
        description: 'Merchant portfolio retrieved successfully.',
        type: MerchantPortfolioResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized — valid JWT required.' })
    @ApiResponse({ status: 404, description: 'Merchant not found.' })
    async getMerchantPortfolio(
        @Param('id') id: string,
        @Query() query: MerchantPortfolioQueryDto,
    ): Promise<MerchantPortfolioResponseDto> {
        const limit = query.limit ?? 20;
        const offset = query.offset ?? 0;

        return this.merchantsService.getMerchantPortfolio(id, limit, offset);
    }

    @Get(':id/analytics')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get a merchant time-series analytics (volume, default rate, avg loan size)' })
    @ApiParam({
        name: 'id',
        description: 'Merchant unique ID (UUID) or Stellar wallet address starting with G.',
        example: 'merchant-1',
    })
    @ApiQuery({ name: 'months', required: false, type: Number, description: 'Number of trailing months to include (default 6, max 24)' })
    @ApiResponse({
        status: 200,
        description: 'Merchant analytics retrieved successfully.',
        type: MerchantAnalyticsResponseDto,
    })
    @ApiResponse({ status: 401, description: 'Unauthorized — valid JWT required.' })
    @ApiResponse({ status: 404, description: 'Merchant not found.' })
    async getMerchantAnalytics(
        @Param('id') id: string,
        @Query() query: MerchantAnalyticsQueryDto,
    ): Promise<MerchantAnalyticsResponseDto> {
        const months = query.months ?? 6;

        return this.merchantsService.getMerchantAnalytics(id, months);
    }
}
