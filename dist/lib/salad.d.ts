import { SaladConfig, SaladTranscriptionRequest, SaladTranscriptionResponse } from '../types';
export declare class SaladService {
    private apiClient;
    private config;
    constructor(config: SaladConfig);
    submitTranscriptionJob(request: SaladTranscriptionRequest): Promise<SaladTranscriptionResponse>;
    getTranscriptionStatus(jobId: string): Promise<SaladTranscriptionResponse>;
    waitForCompletion(jobId: string, pollIntervalMs?: number, maxWaitMs?: number): Promise<SaladTranscriptionResponse>;
    createTranscriptionRequest(mediaUrl: string, webhookUrl: string, options?: Partial<SaladTranscriptionRequest>): SaladTranscriptionRequest;
    validateTranscriptionOptions(options: Partial<SaladTranscriptionRequest>): string[];
}
//# sourceMappingURL=salad.d.ts.map