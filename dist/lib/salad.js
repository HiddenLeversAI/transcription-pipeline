"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaladService = void 0;
const axios_1 = __importDefault(require("axios"));
class SaladService {
    apiClient;
    config;
    constructor(config) {
        this.config = config;
        this.apiClient = axios_1.default.create({
            baseURL: config.apiUrl,
            headers: {
                'Salad-Api-Key': config.apiKey,
                'Content-Type': 'application/json',
            },
        });
    }
    async submitTranscriptionJob(request) {
        try {
            const response = await this.apiClient.post('/transcribe', request);
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Salad API error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
            }
            throw new Error(`Failed to submit transcription job: ${error}`);
        }
    }
    async getTranscriptionStatus(jobId) {
        try {
            const response = await this.apiClient.get(`/transcribe/${jobId}`);
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`Salad API error: ${error.response?.status} - ${error.response?.data?.message || error.message}`);
            }
            throw new Error(`Failed to get transcription status: ${error}`);
        }
    }
    async waitForCompletion(jobId, pollIntervalMs = 30000, maxWaitMs = 1800000) {
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
    createTranscriptionRequest(mediaUrl, webhookUrl, options = {}) {
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
    validateTranscriptionOptions(options) {
        const errors = [];
        if (options.target_language && !options.translate) {
            errors.push('target_language requires translate to be true');
        }
        if (options.caption_format && !['srt', 'vtt', 'json'].includes(options.caption_format)) {
            errors.push('caption_format must be one of: srt, vtt, json');
        }
        return errors;
    }
}
exports.SaladService = SaladService;
//# sourceMappingURL=salad.js.map