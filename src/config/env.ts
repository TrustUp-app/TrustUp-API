import { z } from 'zod';

export const envSchema = z.object({
  MAX_FILE_SIZE_MB: z.coerce.number().default(5),
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('api/v1'),
});

export const env = envSchema.parse({
  MAX_FILE_SIZE_MB: process.env.MAX_FILE_SIZE_MB,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  API_PREFIX: process.env.API_PREFIX,
});

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];
