"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirtableService = void 0;
const axios_1 = __importDefault(require("axios"));
class AirtableService {
    apiClient;
    config;
    constructor(config) {
        this.config = config;
        this.apiClient = axios_1.default.create({
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    async sendWebhook(payload) {
        try {
            const response = await this.apiClient.post(this.config.webhookUrl, payload);
            if (response.status >= 200 && response.status < 300) {
                console.log(`Webhook sent successfully for job ${payload.job_id}`);
            }
            else {
                throw new Error(`Webhook failed with status ${response.status}: ${response.statusText}`);
            }
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Airtable webhook error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
            }
            throw new Error(`Failed to send webhook: ${error}`);
        }
    }
    createWebhookPayload(jobId, r2ObjectKey, saladResponse, processingStartTime) {
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
    async sendCompletionWebhook(jobId, r2ObjectKey, saladResponse, processingStartTime) {
        const payload = this.createWebhookPayload(jobId, r2ObjectKey, saladResponse, processingStartTime);
        await this.sendWebhook(payload);
    }
    async sendErrorWebhook(jobId, r2ObjectKey, error) {
        const payload = {
            job_id: jobId,
            r2_object_key: r2ObjectKey,
            status: 'failed',
            error: error,
        };
        await this.sendWebhook(payload);
    }
    validateWebhookUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.protocol === 'https:' && parsedUrl.hostname.includes('airtable.com');
        }
        catch {
            return false;
        }
    }
}
exports.AirtableService = AirtableService;
//# sourceMappingURL=airtable.js.map