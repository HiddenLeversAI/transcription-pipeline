import { R2Config, SaladConfig, AirtableConfig } from '../types';
export declare const config: {
    r2: R2Config;
    salad: SaladConfig;
    airtable: AirtableConfig;
    app: {
        logLevel: string;
        nodeEnv: string;
    };
};
export declare function validateConfig(): string[];
//# sourceMappingURL=index.d.ts.map