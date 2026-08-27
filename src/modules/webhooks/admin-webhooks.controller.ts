import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { WebhooksService } from './webhooks.service';

@ApiTags('Admin Webhooks')
@ApiHeader({ name: 'x-admin-key', required: true })
@Controller('admin/webhooks')
@UseGuards(AdminApiKeyGuard)
export class AdminWebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get()
  @ApiOperation({ summary: 'List all webhook subscriptions' })
  @ApiResponse({ status: 200, description: 'Webhook subscriptions retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — missing or invalid x-admin-key header' })
  list() {
    return this.webhooks.adminList();
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Inspect delivery logs for a webhook subscription' })
  @ApiResponse({ status: 200, description: 'Delivery logs retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden — missing or invalid x-admin-key header' })
  @ApiResponse({ status: 404, description: 'Webhook subscription not found' })
  deliveries(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.adminDeliveries(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or deactivate a webhook subscription' })
  @ApiResponse({ status: 200, description: 'Webhook subscription updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid URL or events payload' })
  @ApiResponse({ status: 403, description: 'Forbidden — missing or invalid x-admin-key header' })
  @ApiResponse({ status: 404, description: 'Webhook subscription not found' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateWebhookDto) {
    return this.webhooks.adminUpdate(id, dto);
  }
}
