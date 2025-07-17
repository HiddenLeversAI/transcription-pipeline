import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2Config } from '../types';

export class R2Service {
  private s3Client: S3Client;
  private config: R2Config;

  constructor(config: R2Config) {
    this.config = config;
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async generatePresignedUrl(objectKey: string, expiresInSeconds: number = 7200): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.config.bucketName,
      Key: objectKey,
    });

    try {
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: expiresInSeconds });
      return url;
    } catch (error) {
      throw new Error(`Failed to generate presigned URL for ${objectKey}: ${error}`);
    }
  }

  async verifyObjectExists(objectKey: string): Promise<boolean> {
    const command = new HeadObjectCommand({
      Bucket: this.config.bucketName,
      Key: objectKey,
    });

    try {
      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey' || error.name === 'NotFound') {
        return false;
      }
      throw new Error(`Failed to verify object existence for ${objectKey}: ${error}`);
    }
  }

  async getObjectMetadata(objectKey: string): Promise<{
    size: number;
    contentType: string;
    lastModified: Date;
  }> {
    const command = new HeadObjectCommand({
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
    } catch (error) {
      throw new Error(`Failed to get object metadata for ${objectKey}: ${error}`);
    }
  }

  validateMediaFile(contentType: string): boolean {
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