export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  endpoint: string;
}

export interface SaladConfig {
  apiKey: string;
  apiUrl: string;
}

export interface AirtableConfig {
  webhookUrl: string;
}

export interface TranscriptionJob {
  id: string;
  r2ObjectKey: string;
  r2PresignedUrl: string;
  saladJobId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface SaladTranscriptionRequest {
  url: string;
  webhook_url: string;
  job_id?: string;
  language?: string;
  speaker_labels?: boolean;
  timestamps?: boolean;
  translate?: boolean;
  target_language?: string;
  summarize?: boolean;
  sentiment_analysis?: boolean;
  caption_format?: 'srt' | 'vtt' | 'json';
}

export interface SaladTranscriptionResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message?: string;
  created_at: string;
  completed_at?: string;
  transcript?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }>;
  summary?: string;
  sentiment?: string;
  translation?: string;
  captions?: string;
}

export interface AirtableWebhookPayload {
  job_id: string;
  r2_object_key: string;
  status: string;
  transcript?: string;
  segments?: any[];
  summary?: string;
  sentiment?: string;
  translation?: string;
  captions?: string;
  processing_time?: number;
  error?: string;
}