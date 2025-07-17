"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TranscriptionPipeline = void 0;
const config_1 = require("./config");
const r2_1 = require("./lib/r2");
const salad_1 = require("./lib/salad");
const airtable_1 = require("./lib/airtable");
class TranscriptionPipeline {
    r2Service;
    saladService;
    airtableService;
    constructor() {
        this.r2Service = new r2_1.R2Service(config_1.config.r2);
        this.saladService = new salad_1.SaladService(config_1.config.salad);
        this.airtableService = new airtable_1.AirtableService(config_1.config.airtable);
    }
    async processTranscription(r2ObjectKey, options = {}) {
        const jobId = options.jobId || `transcription-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const startTime = new Date();
        const job = {
            id: jobId,
            r2ObjectKey,
            r2PresignedUrl: '',
            status: 'pending',
            createdAt: startTime,
        };
        try {
            console.log(`Starting transcription job ${jobId} for ${r2ObjectKey}`);
            // Step 1: Verify R2 object exists and is valid
            const objectExists = await this.r2Service.verifyObjectExists(r2ObjectKey);
            if (!objectExists) {
                throw new Error(`R2 object ${r2ObjectKey} does not exist`);
            }
            const metadata = await this.r2Service.getObjectMetadata(r2ObjectKey);
            if (!this.r2Service.validateMediaFile(metadata.contentType)) {
                throw new Error(`Unsupported file type: ${metadata.contentType}`);
            }
            // Step 2: Generate presigned URL (2 hour expiry for processing)
            const presignedUrl = await this.r2Service.generatePresignedUrl(r2ObjectKey, 7200);
            job.r2PresignedUrl = presignedUrl;
            // Step 3: Create transcription request
            const transcriptionRequest = this.saladService.createTranscriptionRequest(presignedUrl, config_1.config.airtable.webhookUrl, {
                job_id: jobId,
                language: options.language,
                speaker_labels: options.speakerLabels,
                timestamps: options.timestamps,
                summarize: options.summarize,
                sentiment_analysis: options.sentimentAnalysis,
                translate: options.translate,
                target_language: options.targetLanguage,
                caption_format: options.captionFormat,
            });
            // Step 4: Submit job to Salad.com
            console.log(`Submitting transcription job to Salad.com...`);
            const saladResponse = await this.saladService.submitTranscriptionJob(transcriptionRequest);
            job.saladJobId = saladResponse.job_id;
            job.status = 'processing';
            console.log(`Transcription job submitted successfully. Salad job ID: ${saladResponse.job_id}`);
            console.log(`Webhook will be sent to Airtable when transcription is complete.`);
            return job;
        }
        catch (error) {
            console.error(`Error in transcription job ${jobId}:`, error);
            job.status = 'failed';
            job.error = error instanceof Error ? error.message : 'Unknown error';
            job.completedAt = new Date();
            // Send error webhook to Airtable
            try {
                await this.airtableService.sendErrorWebhook(jobId, r2ObjectKey, job.error);
            }
            catch (webhookError) {
                console.error('Failed to send error webhook:', webhookError);
            }
            throw error;
        }
    }
    async checkJobStatus(jobId) {
        try {
            const status = await this.saladService.getTranscriptionStatus(jobId);
            return status;
        }
        catch (error) {
            console.error(`Failed to check job status for ${jobId}:`, error);
            throw error;
        }
    }
    async waitForJobCompletion(jobId, pollIntervalMs = 30000) {
        try {
            const result = await this.saladService.waitForCompletion(jobId, pollIntervalMs);
            return result;
        }
        catch (error) {
            console.error(`Error waiting for job completion ${jobId}:`, error);
            throw error;
        }
    }
}
exports.TranscriptionPipeline = TranscriptionPipeline;
// CLI interface
async function main() {
    const errors = (0, config_1.validateConfig)();
    if (errors.length > 0) {
        console.error('Configuration errors:');
        errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
    }
    const pipeline = new TranscriptionPipeline();
    const r2ObjectKey = process.argv[2];
    if (!r2ObjectKey) {
        console.error('Usage: npm run dev <r2-object-key>');
        console.error('Example: npm run dev media/video.mp4');
        process.exit(1);
    }
    try {
        const job = await pipeline.processTranscription(r2ObjectKey, {
            speakerLabels: true,
            timestamps: true,
            summarize: true,
            sentimentAnalysis: true,
        });
        console.log('Job created successfully:');
        console.log(JSON.stringify(job, null, 2));
    }
    catch (error) {
        console.error('Pipeline failed:', error);
        process.exit(1);
    }
}
// Run CLI if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}
exports.default = TranscriptionPipeline;
//# sourceMappingURL=index.js.map