import { Hono } from 'hono';
type Bindings = {
    R2_BUCKET: R2Bucket;
    DB: D1Database;
    SALAD_API_KEY: string;
    SALAD_ORG_NAME: string;
    ACCESS_TOKEN: string;
    AIRTABLE_WEBHOOK_URL: string;
    WORKER_URL: string;
    ACCOUNT_ID: string;
    BUCKET_NAME: string;
    SALAD_WEBHOOK_SECRET: string;
    R2_PUBLIC_URL: string;
};
declare const app: Hono<{
    Bindings: Bindings;
}, {}, "/">;
export default app;
//# sourceMappingURL=index.d.ts.map