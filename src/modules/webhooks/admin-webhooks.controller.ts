import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
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
  list() {
    return this.webhooks.adminList();
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Inspect delivery logs for a webhook subscription' })
  deliveries(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.adminDeliveries(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or deactivate a webhook subscription' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateWebhookDto) {
    return this.webhooks.adminUpdate(id, dto);
  }
}
