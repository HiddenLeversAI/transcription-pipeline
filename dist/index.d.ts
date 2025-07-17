import { TranscriptionJob } from './types';
export declare class TranscriptionPipeline {
    private r2Service;
    private saladService;
    private airtableService;
    constructor();
    processTranscription(r2ObjectKey: string, options?: {
        jobId?: string;
        language?: string;
        speakerLabels?: boolean;
        timestamps?: boolean;
        summarize?: boolean;
        sentimentAnalysis?: boolean;
        translate?: boolean;
        targetLanguage?: string;
        captionFormat?: 'srt' | 'vtt' | 'json';
    }): Promise<TranscriptionJob>;
    checkJobStatus(jobId: string): Promise<any>;
    waitForJobCompletion(jobId: string, pollIntervalMs?: number): Promise<any>;
}
export default TranscriptionPipeline;
//# sourceMappingURL=index.d.ts.map