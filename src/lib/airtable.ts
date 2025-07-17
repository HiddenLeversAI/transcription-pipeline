import axios, { AxiosInstance } from 'axios';
import { AirtableConfig, AirtableWebhookPayload, SaladTranscriptionResponse } from '../types';

export class AirtableService {
  private apiClient: AxiosInstance;
  private config: AirtableConfig;

  constructor(config: AirtableConfig) {
    this.config = config;
    this.apiClient = axios.create({
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async sendWebhook(payload: AirtableWebhookPayload): Promise<void> {
    try {
      const response = await this.apiClient.post(this.config.webhookUrl, payload);
      
      if (response.status >= 200 && response.status < 300) {
        console.log(`Webhook sent successfully for job ${payload.job_id}`);
      } else {
        throw new Error(`Webhook failed with status ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Airtable webhook error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
      }
      throw new Error(`Failed to send webhook: ${error}`);
    }
  }

  createWebhookPayload(
    jobId: string,
    r2ObjectKey: string,
    saladResponse: SaladTranscriptionResponse,
    processingStartTime?: Date
  ): AirtableWebhookPayload {
    const processingTime = processingStartTime ? 
      (new Date().getTime() - processingStartTime.getTime()) / 1000 : undefined;

    return {
      job_id: jobId,
      r2_object_key: r2ObjectKey,
      status: saladResponse.status,
      transcript: saladResponse.transcript,
      segments: saladResponse.segments,
      summary: saladResponse.summary,
      sentiment: saladResponse.sentiment,
      translation: saladResponse.translation,
      captions: saladResponse.captions,
      processing_time: processingTime,
      error: saladResponse.status === 'failed' ? saladResponse.message : undefined,
    };
  }

  async sendCompletionWebhook(
    jobId: string,
    r2ObjectKey: string,
    saladResponse: SaladTranscriptionResponse,
    processingStartTime?: Date
  ): Promise<void> {
    const payload = this.createWebhookPayload(jobId, r2ObjectKey, saladResponse, processingStartTime);
    await this.sendWebhook(payload);
  }

  async sendErrorWebhook(
    jobId: string,
    r2ObjectKey: string,
    error: string
  ): Promise<void> {
    const payload: AirtableWebhookPayload = {
      job_id: jobId,
      r2_object_key: r2ObjectKey,
      status: 'failed',
      error: error,
    };
    
    await this.sendWebhook(payload);
  }

  validateWebhookUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'https:' && parsedUrl.hostname.includes('airtable.com');
    } catch {
      return false;
    }
  }
}