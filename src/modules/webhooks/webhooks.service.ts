import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MerchantsRepository } from '../../database/repositories/merchants.repository';
import { SupabaseService } from '../../database/supabase.client';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { generateWebhookSecret } from './hmac.util';

const DEFAULT_EVENTS = ['loan.status_changed'];

@Injectable()
export class WebhooksService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly merchants: MerchantsRepository,
  ) {}

  async create(wallet: string, dto: CreateWebhookDto) {
    const merchant = await this.requireMerchant(wallet);
    const secret = generateWebhookSecret();
    const { data, error } = await this.db()
      .from('webhook_endpoints')
      .insert({
        merchant_id: merchant.id,
        url: dto.url,
        secret,
        events: dto.events?.length ? dto.events : DEFAULT_EVENTS,
        is_active: true,
      })
      .select('id, merchant_id, url, events, is_active, created_at, updated_at, secret')
      .single();

    if (error?.code === '23505') {
      throw new ConflictException({
        code: 'WEBHOOK_URL_EXISTS',
        message: 'A webhook for this URL is already registered.',
      });
    }
    this.throwOnError(error);
    return data;
  }

  async listMine(wallet: string) {
    const merchant = await this.requireMerchant(wallet);
    const { data, error } = await this.db()
      .from('webhook_endpoints')
      .select('id, merchant_id, url, events, is_active, created_at, updated_at')
      .eq('merchant_id', merchant.id)
      .order('created_at', { ascending: false });
    this.throwOnError(error);
    return { endpoints: data ?? [] };
  }

  async getMine(wallet: string, id: string) {
    const merchant = await this.requireMerchant(wallet);
    const endpoint = await this.getEndpoint(id);
    this.assertOwner(endpoint.merchant_id, merchant.id);
    return this.publicEndpoint(endpoint);
  }

  async updateMine(wallet: string, id: string, dto: UpdateWebhookDto) {
    const merchant = await this.requireMerchant(wallet);
    const endpoint = await this.getEndpoint(id);
    this.assertOwner(endpoint.merchant_id, merchant.id);
    const { data, error } = await this.db()
      .from('webhook_endpoints')
      .update({
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, merchant_id, url, events, is_active, created_at, updated_at')
      .single();
    this.throwOnError(error);
    return data;
  }

  async deleteMine(wallet: string, id: string): Promise<{ id: string }> {
    const merchant = await this.requireMerchant(wallet);
    const endpoint = await this.getEndpoint(id);
    this.assertOwner(endpoint.merchant_id, merchant.id);
    const { error } = await this.db().from('webhook_endpoints').delete().eq('id', id);
    this.throwOnError(error);
    return { id };
  }

  async adminList() {
    const { data, error } = await this.db()
      .from('webhook_endpoints')
      .select('id, merchant_id, url, events, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });
    this.throwOnError(error);
    return { endpoints: data ?? [] };
  }

  async adminDeliveries(endpointId: string) {
    await this.getEndpoint(endpointId);
    const { data, error } = await this.db()
      .from('webhook_deliveries')
      .select(
        'id, endpoint_id, event_id, event, status, attempts, response_code, last_error, created_at, updated_at',
      )
      .eq('endpoint_id', endpointId)
      .order('created_at', { ascending: false })
      .limit(100);
    this.throwOnError(error);
    return { deliveries: data ?? [] };
  }

  async adminUpdate(id: string, dto: UpdateWebhookDto) {
    await this.getEndpoint(id);
    const { data, error } = await this.db()
      .from('webhook_endpoints')
      .update({
        ...(dto.url !== undefined ? { url: dto.url } : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('id, merchant_id, url, events, is_active, created_at, updated_at')
      .single();
    this.throwOnError(error);
    return data;
  }

  private async requireMerchant(wallet: string) {
    const merchant = await this.merchants.findByWallet(wallet);
    if (!merchant) {
      throw new ForbiddenException({
        code: 'MERCHANT_REQUIRED',
        message: 'Webhook registration is limited to merchant wallets.',
      });
    }
    return merchant;
  }

  private async getEndpoint(id: string) {
    const { data, error } = await this.db()
      .from('webhook_endpoints')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    this.throwOnError(error);
    if (!data) {
      throw new NotFoundException({
        code: 'WEBHOOK_NOT_FOUND',
        message: 'Webhook endpoint not found.',
      });
    }
    return data;
  }

  private assertOwner(ownerId: string, merchantId: string) {
    if (ownerId !== merchantId) {
      throw new NotFoundException({
        code: 'WEBHOOK_NOT_FOUND',
        message: 'Webhook endpoint not found.',
      });
    }
  }

  private publicEndpoint(row: Record<string, unknown>) {
    const { secret: _secret, ...rest } = row;
    return rest;
  }

  private db() {
    return this.supabase.getServiceRoleClient();
  }

  private throwOnError(error: { message?: string } | null): void {
    if (error) {
      throw error;
    }
  }
}
