"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    r2: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '',
        bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || '',
        endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || '',
    },
    salad: {
        apiKey: process.env.SALAD_API_KEY || '',
        apiUrl: process.env.SALAD_API_URL || '',
    },
    airtable: {
        webhookUrl: process.env.AIRTABLE_WEBHOOK_URL || '',
    },
    app: {
        logLevel: process.env.LOG_LEVEL || 'info',
        nodeEnv: process.env.NODE_ENV || 'development',
    },
};
function validateConfig() {
    const errors = [];
    // Validate R2 config
    if (!exports.config.r2.accountId)
        errors.push('CLOUDFLARE_ACCOUNT_ID is required');
    if (!exports.config.r2.accessKeyId)
        errors.push('CLOUDFLARE_R2_ACCESS_KEY_ID is required');
    if (!exports.config.r2.secretAccessKey)
        errors.push('CLOUDFLARE_R2_SECRET_ACCESS_KEY is required');
    if (!exports.config.r2.bucketName)
        errors.push('CLOUDFLARE_R2_BUCKET_NAME is required');
    if (!exports.config.r2.endpoint)
        errors.push('CLOUDFLARE_R2_ENDPOINT is required');
    // Validate Salad config
    if (!exports.config.salad.apiKey)
        errors.push('SALAD_API_KEY is required');
    if (!exports.config.salad.apiUrl)
        errors.push('SALAD_API_URL is required');
    // Validate Airtable config
    if (!exports.config.airtable.webhookUrl)
        errors.push('AIRTABLE_WEBHOOK_URL is required');
    return errors;
}
//# sourceMappingURL=index.js.map