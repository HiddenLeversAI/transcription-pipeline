"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.R2Service = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
class R2Service {
    s3Client;
    config;
    constructor(config) {
        this.config = config;
        this.s3Client = new client_s3_1.S3Client({
            region: 'auto',
            endpoint: config.endpoint,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
    }
    async generatePresignedUrl(objectKey, expiresInSeconds = 7200) {
        const command = new client_s3_1.GetObjectCommand({
            Bucket: this.config.bucketName,
            Key: objectKey,
        });
        try {
            const url = await (0, s3_request_presigner_1.getSignedUrl)(this.s3Client, command, { expiresIn: expiresInSeconds });
            return url;
        }
        catch (error) {
            throw new Error(`Failed to generate presigned URL for ${objectKey}: ${error}`);
        }
    }
    async verifyObjectExists(objectKey) {
        const command = new client_s3_1.HeadObjectCommand({
            Bucket: this.config.bucketName,
            Key: objectKey,
        });
        try {
            await this.s3Client.send(command);
            return true;
        }
        catch (error) {
            if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
                return false;
            }
            throw new Error(`Failed to verify object existence for ${objectKey}: ${error}`);
        }
    }
    async getObjectMetadata(objectKey) {
        const command = new client_s3_1.HeadObjectCommand({
            Bucket: this.config.bucketName,
            Key: objectKey,
        });
        try {
            const response = await this.s3Client.send(command);
            return {
                size: response.ContentLength || 0,
                contentType: response.ContentType || 'application/octet-stream',
                lastModified: response.LastModified || new Date(),
            };
        }
        catch (error) {
            throw new Error(`Failed to get object metadata for ${objectKey}: ${error}`);
        }
    }
    validateMediaFile(contentType) {
        const supportedTypes = [
            'audio/aiff',
            'audio/flac',
            'audio/mp4',
            'audio/mpeg',
            'audio/wav',
            'audio/x-m4a',
            'video/mp4',
            'video/quicktime',
            'video/webm',
            'video/x-msvideo',
            'video/x-ms-wmv',
            'video/x-matroska',
        ];
        return supportedTypes.includes(contentType.toLowerCase());
    }
}
exports.R2Service = R2Service;
//# sourceMappingURL=r2.js.map