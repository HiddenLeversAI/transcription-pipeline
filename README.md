# Transcription Pipeline

An automated transcription pipeline that connects Cloudflare R2 storage with Salad.com's transcription API and sends results to Airtable via webhooks.

## Architecture

1. **R2 Object** → Generate presigned URL
2. **Salad.com API** → Submit transcription job with Airtable webhook URL
3. **Salad.com** → Processes file and sends results directly to Airtable
4. **Airtable** → Receives webhook and triggers automation

## Features

- **R2 Integration**: Secure presigned URL generation for media files
- **Salad.com Transcription**: High-accuracy transcription with Whisper Large v3
- **Airtable Automation**: Direct webhook integration for workflow triggers
- **TypeScript**: Full type safety and IntelliSense support
- **Error Handling**: Comprehensive error handling and logging
- **CLI Interface**: Simple command-line interface for testing

## Supported Features

- **Audio Formats**: AIFF, FLAC, M4A, MP3, WAV
- **Video Formats**: MKV, MOV, WEBM, WMA, MP4, AVI
- **Transcription Options**: Speaker labels, timestamps, summaries, sentiment analysis
- **Multilingual**: 97+ language support
- **Captions**: SRT, VTT, and JSON formats

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Cloudflare R2 Configuration
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key_id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
CLOUDFLARE_R2_BUCKET_NAME=your_r2_bucket_name
CLOUDFLARE_R2_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com

# Salad.com Configuration
SALAD_API_KEY=your_salad_api_key
SALAD_API_URL=your_salad_api_url

# Airtable Configuration
AIRTABLE_WEBHOOK_URL=your_airtable_webhook_url
```

### 3. Build the Project

```bash
npm run build
```

## Usage

### CLI Interface

Process a single file:

```bash
npm run dev media/video.mp4
```

### Programmatic Usage

```typescript
import TranscriptionPipeline from './src/index';

const pipeline = new TranscriptionPipeline();

// Process transcription with options
const job = await pipeline.processTranscription('media/video.mp4', {
  speakerLabels: true,
  timestamps: true,
  summarize: true,
  sentimentAnalysis: true,
  translate: true,
  targetLanguage: 'es',
  captionFormat: 'srt'
});

console.log('Job ID:', job.id);
console.log('Status:', job.status);
```

## Configuration

### Salad.com Setup

1. Create account at [portal.salad.com](https://portal.salad.com)
2. Get your API key from the dashboard
3. Note your API URL endpoint

### Airtable Setup

1. Create an Airtable automation with webhook trigger
2. Copy the webhook URL from the automation settings
3. Design your automation to process the incoming data

### Cloudflare R2 Setup

1. Create R2 bucket in Cloudflare dashboard
2. Generate API tokens with R2 permissions
3. Configure your R2 endpoint URL

## Webhook Payload

The webhook sent to Airtable includes:

```json
{
  "job_id": "transcription-1234567890-abc123",
  "r2_object_key": "media/video.mp4",
  "status": "completed",
  "transcript": "Full transcript text...",
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "text": "Hello world",
      "speaker": "Speaker 1"
    }
  ],
  "summary": "Brief summary of content...",
  "sentiment": "positive",
  "translation": "Spanish translation...",
  "captions": "SRT formatted captions...",
  "processing_time": 45.2,
  "error": null
}
```

## Error Handling

The pipeline includes comprehensive error handling:

- **R2 Errors**: Object not found, invalid file types, access issues
- **Salad.com Errors**: API failures, job submission issues, processing errors
- **Airtable Errors**: Webhook delivery failures, invalid URLs
- **Network Errors**: Timeout handling, retry logic, connection issues

Error webhooks are automatically sent to Airtable for failed jobs.

## Scripts

- `npm run dev <file>` - Run transcription pipeline for a file
- `npm run build` - Build TypeScript to JavaScript
- `npm run start <file>` - Run built version
- `npm run type-check` - Check TypeScript types without building

## Cost Estimation

- **Salad.com**: $0.10/hour for standard transcription, $0.03/hour for lite
- **Cloudflare R2**: $0.015/GB storage, $0.36/million requests
- **Processing Time**: ~5x playback speed (10 min video = ~2 min processing)

## Support

For issues or questions:
- Check the error logs in the console output
- Verify all environment variables are correctly set
- Ensure your R2 object exists and is a supported media format
- Test your Airtable webhook URL independently

## License

MIT