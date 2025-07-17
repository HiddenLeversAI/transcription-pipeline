import { R2Config } from '../types';
export declare class R2Service {
    private s3Client;
    private config;
    constructor(config: R2Config);
    generatePresignedUrl(objectKey: string, expiresInSeconds?: number): Promise<string>;
    verifyObjectExists(objectKey: string): Promise<boolean>;
    getObjectMetadata(objectKey: string): Promise<{
        size: number;
        contentType: string;
        lastModified: Date;
    }>;
    validateMediaFile(contentType: string): boolean;
}
//# sourceMappingURL=r2.d.ts.map