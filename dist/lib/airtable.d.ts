import { AirtableConfig, AirtableWebhookPayload, SaladTranscriptionResponse } from '../types';
export declare class AirtableService {
    private apiClient;
    private config;
    constructor(config: AirtableConfig);
    sendWebhook(payload: AirtableWebhookPayload): Promise<void>;
    createWebhookPayload(jobId: string, r2ObjectKey: string, saladResponse: SaladTranscriptionResponse, processingStartTime?: Date): AirtableWebhookPayload;
    sendCompletionWebhook(jobId: string, r2ObjectKey: string, saladResponse: SaladTranscriptionResponse, processingStartTime?: Date): Promise<void>;
    sendErrorWebhook(jobId: string, r2ObjectKey: string, error: string): Promise<void>;
    validateWebhookUrl(url: string): boolean;
}
//# sourceMappingURL=airtable.d.ts.map