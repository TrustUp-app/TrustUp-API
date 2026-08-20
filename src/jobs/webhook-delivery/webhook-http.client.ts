import { Injectable } from '@nestjs/common';

export interface WebhookHttpResponse {
  status: number;
  body: string;
}

export abstract class WebhookHttpClient {
  abstract post(
    url: string,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookHttpResponse>;
}

@Injectable()
export class FetchWebhookHttpClient extends WebhookHttpClient {
  async post(
    url: string,
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<WebhookHttpResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: rawBody,
    });
    const body = await response.text();
    return { status: response.status, body };
  }
}
