import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('Webhooks')
@ApiBearerAuth('JWT-auth')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Post()
  @ApiOperation({ summary: 'Register an outbound webhook endpoint for the authenticated merchant' })
  @ApiResponse({ status: 201, description: 'Endpoint created. Secret is returned once.' })
  create(@CurrentUser() user: { wallet: string }, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(user.wallet, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List webhook endpoints for the authenticated merchant' })
  list(@CurrentUser() user: { wallet: string }) {
    return this.webhooks.listMine(user.wallet);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a webhook endpoint owned by the authenticated merchant' })
  getOne(@CurrentUser() user: { wallet: string }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.getMine(user.wallet, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a webhook endpoint owned by the authenticated merchant' })
  update(
    @CurrentUser() user: { wallet: string },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhooks.updateMine(user.wallet, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook endpoint owned by the authenticated merchant' })
  remove(@CurrentUser() user: { wallet: string }, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.deleteMine(user.wallet, id);
  }
}
