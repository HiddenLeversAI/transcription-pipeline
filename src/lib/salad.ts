import axios, { AxiosInstance } from 'axios';
import { SaladConfig, SaladTranscriptionRequest, SaladTranscriptionResponse } from '../types';

export class SaladService {
  private apiClient: AxiosInstance;
  private config: SaladConfig;

  constructor(config: SaladConfig) {
    this.config = config;
    this.apiClient = axios.create({
      baseURL: config.apiUrl,
      headers: {
        'Salad-Api-Key': config.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  async submitTranscriptionJob(request: SaladTranscriptionRequest): Promise<SaladTranscriptionResponse> {
    try {
      const response = await this.apiClient.post('/transcribe', request);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Salad API error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
      }
      throw new Error(`Failed to submit transcription job: ${error}`);
    }
  }

  async getTranscriptionStatus(jobId: string): Promise<SaladTranscriptionResponse> {
    try {
      const response = await this.apiClient.get(`/transcribe/${jobId}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Salad API error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
      }
      throw new Error(`Failed to get transcription status: ${error}`);
    }
  }

  async waitForCompletion(jobId: string, pollIntervalMs: number = 30000, maxWaitMs: number = 1800000): Promise<SaladTranscriptionResponse> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getTranscriptionStatus(jobId);
      
      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    throw new Error(`Transcription job ${jobId} timed out after ${maxWaitMs}ms`);
  }

  createTranscriptionRequest(
    mediaUrl: string,
    webhookUrl: string,
    options: Partial<SaladTranscriptionRequest> = {}
  ): SaladTranscriptionRequest {
    return {
      url: mediaUrl,
      webhook_url: webhookUrl,
      speaker_labels: true,
      timestamps: true,
      summarize: false,
      sentiment_analysis: false,
      caption_format: 'srt',
      ...options,
    };
  }

  validateTranscriptionOptions(options: Partial<SaladTranscriptionRequest>): string[] {
    const errors: string[] = [];
    
    if (options.target_language && !options.translate) {
      errors.push('target_language requires translate to be true');
    }
    
    if (options.caption_format && !['srt', 'vtt', 'json'].includes(options.caption_format)) {
      errors.push('caption_format must be one of: srt, vtt, json');
    }
    
    return errors;
  }
}