import dotenv from 'dotenv';
import { R2Config, SaladConfig, AirtableConfig } from '../types';

dotenv.config();

export const config = {
  r2: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
    bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || '',
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || '',
  } as R2Config,
  
  salad: {
    apiKey: process.env.SALAD_API_KEY || '',
    apiUrl: process.env.SALAD_API_URL || '',
  } as SaladConfig,
  
  airtable: {
    webhookUrl: process.env.AIRTABLE_WEBHOOK_URL || '',
  } as AirtableConfig,
  
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};

export function validateConfig(): string[] {
  const errors: string[] = [];
  
  // Validate R2 config
  if (!config.r2.accountId) errors.push('CLOUDFLARE_ACCOUNT_ID is required');
  if (!config.r2.accessKeyId) errors.push('CLOUDFLARE_R2_ACCESS_KEY_ID is required');
  if (!config.r2.secretAccessKey) errors.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY is required');
  if (!config.r2.bucketName) errors.push('CLOUDFLARE_R2_BUCKET_NAME is required');
  if (!config.r2.endpoint) errors.push('CLOUDFLARE_R2_ENDPOINT is required');
  
  // Validate Salad config
  if (!config.salad.apiKey) errors.push('SALAD_API_KEY is required');
  if (!config.salad.apiUrl) errors.push('SALAD_API_URL is required');
  
  // Validate Airtable config
  if (!config.airtable.webhookUrl) errors.push('AIRTABLE_WEBHOOK_URL is required');
  
  return errors;
}