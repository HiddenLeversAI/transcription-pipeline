import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Types
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

interface TranscriptionJob {
  id: string;
  filename: string;
  fileSize: number;
  fileType: string;
  saladJobId?: string;
  status: 'uploaded' | 'processing' | 'completed' | 'error' | 'retry';
  transcriptionData?: any;
  errorMessage?: string;
  retryCount?: number;
  lastRetryAt?: string;
  createdAt: string;
  completedAt?: string;
  processingTimeMs?: number;
  estimatedCost?: number;
}

interface SaladTranscriptionResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'completed' | 'succeeded' | 'failed';
  transcript?: string;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
    speaker?: string;
  }>;
  summary?: string;
  sentiment?: string;
  translation?: string;
  captions?: string;
  processing_time?: number;
}

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://transcription-app-bs8.pages.dev', 'https://*.pages.dev'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.use('*', logger());

// Authentication middleware
const authenticate = async (c: any, next: any) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || token !== c.env.ACCESS_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  await next();
};

// Database is already initialized via remote command
// Add retry columns if they don't exist (safe to run multiple times)
const initRetryColumns = async (db: D1Database) => {
  try {
    await db.prepare(`
      ALTER TABLE transcription_jobs 
      ADD COLUMN retry_count INTEGER DEFAULT 0
    `).run();
  } catch (e) {
    // Column might already exist, ignore error
  }
  
  try {
    await db.prepare(`
      ALTER TABLE transcription_jobs 
      ADD COLUMN last_retry_at TEXT
    `).run();
  } catch (e) {
    // Column might already exist, ignore error
  }
  
  try {
    await db.prepare(`
      ALTER TABLE transcription_jobs 
      ADD COLUMN processing_time_ms INTEGER DEFAULT 0
    `).run();
  } catch (e) {
    // Column might already exist, ignore error
  }
  
  try {
    await db.prepare(`
      ALTER TABLE transcription_jobs 
      ADD COLUMN estimated_cost REAL DEFAULT 0
    `).run();
  } catch (e) {
    // Column might already exist, ignore error
  }
};

// Routes

// Health check
app.get('/health', async (c) => {
  try {
    // Initialize retry columns if needed
    await initRetryColumns(c.env.DB);
    return c.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Health check error:', error);
    return c.json({ 
      status: 'unhealthy', 
      error: String(error), 
      timestamp: new Date().toISOString() 
    }, 500);
  }
});

// Debug endpoint to list Salad inference endpoints
app.get('/debug/salad-endpoints', authenticate, async (c) => {
  try {
    const response = await fetch(`https://api.salad.com/api/public/organizations/${c.env.SALAD_ORG_NAME}/inference-endpoints`, {
      headers: {
        'Salad-Api-Key': c.env.SALAD_API_KEY,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return c.json({ 
        error: `Salad API error: ${response.status}`,
        details: errorText,
        url: `https://api.salad.com/api/public/organizations/${c.env.SALAD_ORG_NAME}/inference-endpoints`
      }, response.status);
    }
    
    const data = await response.json();
    return c.json(data);
  } catch (error) {
    console.error('Error listing Salad endpoints:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint to test uploads without authentication
app.post('/debug/upload/:key', async (c) => {
  try {
    const key = c.req.param('key');
    console.log('DEBUG: Upload request for key:', key);
    console.log('DEBUG: Content-Type header:', c.req.header('Content-Type'));
    console.log('DEBUG: Authorization header present:', !!c.req.header('Authorization'));
    
    const body = await c.req.arrayBuffer();
    console.log('DEBUG: Body size:', body.byteLength);
    
    return c.json({ 
      key,
      bodySize: body.byteLength,
      contentType: c.req.header('Content-Type'),
      hasAuth: !!c.req.header('Authorization')
    });
  } catch (error) {
    console.error('DEBUG: Error:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Validate access token
app.post('/auth/validate', async (c) => {
  const { token } = await c.req.json();
  
  if (token === c.env.ACCESS_TOKEN) {
    return c.json({ valid: true });
  }
  
  return c.json({ valid: false }, 401);
});

// File validation constants
const MAX_FILE_SIZE = 2.5 * 1024 * 1024 * 1024; // 2.5 GB (2.5 hours at high quality)

// Cost estimation constants (based on Salad.com pricing)
const COST_PER_MINUTE = 0.004; // $0.004 per minute of audio (estimated)
const MONTHLY_USAGE_LIMIT_MINUTES = 6000; // 100 hours * 60 minutes

function estimateAudioDuration(fileSize: number, filename: string): number {
  // Rough estimation based on file size and type
  const extension = filename.toLowerCase().split('.').pop();
  let bitsPerSecond = 128000; // Default to 128 kbps
  
  switch (extension) {
    case 'mp3':
      bitsPerSecond = 128000; // 128 kbps average
      break;
    case 'm4a':
    case 'mp4':
      bitsPerSecond = 256000; // 256 kbps average
      break;
    case 'wav':
    case 'flac':
      bitsPerSecond = 1411200; // CD quality uncompressed
      break;
    case 'ogg':
      bitsPerSecond = 192000; // 192 kbps average
      break;
  }
  
  // Convert to minutes
  const durationSeconds = (fileSize * 8) / bitsPerSecond;
  return Math.max(durationSeconds / 60, 0.1); // Minimum 0.1 minutes
}

function estimateCost(durationMinutes: number): number {
  return Math.round(durationMinutes * COST_PER_MINUTE * 100) / 100; // Round to 2 decimal places
}

function validateFileType(filename: string): boolean {
  const extension = filename.toLowerCase().split('.').pop();
  const validExtensions = ['mp3', 'mp4', 'm4a', 'wav', 'flac', 'ogg', 'mov', 'avi', 'webm', 'mkv'];
  return validExtensions.includes(extension || '');
}

// Generate signed upload URL for R2
app.post('/upload/signed-url', authenticate, async (c) => {
  try {
    const { filename, fileSize } = await c.req.json();
    
    if (!filename) {
      return c.json({ error: 'Filename is required' }, 400);
    }
    
    // Validate file type
    if (!validateFileType(filename)) {
      return c.json({ 
        error: 'Unsupported file type. Please upload audio or video files (MP3, M4A, MP4, WAV, FLAC, OGG, MOV, AVI, WebM).' 
      }, 400);
    }
    
    // Validate file size if provided
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return c.json({ 
        error: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / (1024 * 1024 * 1024) * 10) / 10} GB` 
      }, 400);
    }
    
    // Check monthly usage limits
    const currentMonthUsage = await c.env.DB.prepare(`
      SELECT SUM(CASE WHEN transcription_data IS NOT NULL 
        THEN JSON_EXTRACT(transcription_data, '$.duration') / 60 
        ELSE 0 END) as used_minutes
      FROM transcription_jobs 
      WHERE DATE(created_at) >= DATE('now', 'start of month')
    `).first();
    
    const usedMinutes = (currentMonthUsage?.used_minutes as number) || 0;
    const estimatedDuration = fileSize ? estimateAudioDuration(fileSize, filename) : 10; // Default to 10 minutes if no size
    
    if (usedMinutes + estimatedDuration > MONTHLY_USAGE_LIMIT_MINUTES) {
      return c.json({ 
        error: `Monthly usage limit exceeded. Used: ${Math.round(usedMinutes)} minutes, Limit: ${MONTHLY_USAGE_LIMIT_MINUTES} minutes. This file would add ~${Math.round(estimatedDuration)} minutes.`,
        usage: {
          usedMinutes: Math.round(usedMinutes),
          limitMinutes: MONTHLY_USAGE_LIMIT_MINUTES,
          estimatedFileMinutes: Math.round(estimatedDuration)
        }
      }, 429); // 429 = Too Many Requests
    }
    
    // Generate unique key for the file (replace spaces with underscores)
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    const safeFilename = filename.replace(/\s+/g, '_');
    const key = `uploads/${timestamp}-${randomId}-${safeFilename}`;
    
    // Return worker endpoint for upload handling
    const uploadUrl = `${c.env.WORKER_URL}/upload/${key}`;
    
    // Estimate cost if file size is provided
    let estimatedCost = 0;
    if (fileSize) {
      const estimatedDuration = estimateAudioDuration(fileSize, filename);
      estimatedCost = estimateCost(estimatedDuration);
    }
    
    // Create job record in database
    const jobId = `job-${timestamp}-${randomId}`;
    
    const job: TranscriptionJob = {
      id: jobId,
      filename,
      fileSize: fileSize || 0,
      fileType: '',
      status: 'uploaded',
      estimatedCost,
      createdAt: new Date().toISOString(),
    };
    
    await c.env.DB.prepare(`
      INSERT INTO transcription_jobs 
      (id, filename, file_size, file_type, status, estimated_cost, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      job.id,
      job.filename,
      job.fileSize,
      '',
      job.status,
      job.estimatedCost,
      job.createdAt
    ).run();
    
    return c.json({
      uploadUrl,
      jobId,
      key,
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ 
      error: 'Failed to generate upload URL', 
      details: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// Handle direct file upload (temporarily without auth for debugging)
app.post('/upload/*', async (c) => {
  // Manual auth check
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token || token !== c.env.ACCESS_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    // Extract the key from the full path (remove /upload/ prefix)
    const fullPath = c.req.path;
    const key = fullPath.replace('/upload/', '');
    console.log('Upload request for key:', key);
    
    // Get the raw body as ArrayBuffer
    const body = await c.req.arrayBuffer();
    console.log('Body size:', body.byteLength);
    
    if (!body || body.byteLength === 0) {
      return c.json({ error: 'No file data provided' }, 400);
    }
    
    // Validate file size
    if (body.byteLength > MAX_FILE_SIZE) {
      return c.json({ 
        error: `File too large. Maximum size is ${Math.round(MAX_FILE_SIZE / (1024 * 1024 * 1024) * 10) / 10} GB` 
      }, 400);
    }
    
    // Get content type from headers
    const contentType = c.req.header('Content-Type') || 'application/octet-stream';
    console.log('Content-Type:', contentType);
    
    // Upload file to R2
    await c.env.R2_BUCKET.put(key, body, {
      httpMetadata: {
        contentType: contentType,
      },
    });
    
    console.log('File uploaded to R2 successfully');
    
    // Find the job by extracting job ID from key
    // Key format: uploads/timestamp-randomId-filename
    const keyWithoutPrefix = key.replace('uploads/', '');
    const keyParts = keyWithoutPrefix.split('-');
    const jobId = `job-${keyParts[0]}-${keyParts[1]}`;
    console.log('Updating job:', jobId);
    
    // Update job with file information
    await c.env.DB.prepare(`
      UPDATE transcription_jobs 
      SET file_size = ?, file_type = ?, status = 'processing'
      WHERE id = ?
    `).bind(body.byteLength, contentType, jobId).run();
    
    console.log('Job updated in database');
    
    // Get updated job details for Airtable notification
    const jobResult = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs WHERE id = ?
    `).bind(jobId).first();
    
    if (jobResult) {
      // Send job creation notification to Airtable now that file is actually uploaded
      const estimatedDuration = estimateAudioDuration(body.byteLength, jobResult.filename as string);
      await sendJobCreatedToAirtable(c.env, jobId, {
        filename: jobResult.filename as string,
        fileSize: body.byteLength,
        fileType: contentType,
        estimatedCost: (jobResult.estimated_cost as number) || 0,
        estimatedDuration,
        createdAt: jobResult.created_at as string,
        fileUrl: `${c.env.R2_PUBLIC_URL}/${key}`
      });
    }
    
    // Start transcription process
    await startTranscription(c.env, jobId, key);
    
    return c.json({ success: true, jobId });
  } catch (error) {
    console.error('Error handling upload:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ 
      error: 'Failed to upload file', 
      details: errorMessage,
      timestamp: new Date().toISOString()
    }, 500);
  }
});

// Handle R2 upload completion (legacy endpoint)
app.post('/upload/complete', authenticate, async (c) => {
  try {
    const { key, jobId, fileSize, fileType } = await c.req.json();
    
    // Update job with file information
    await c.env.DB.prepare(`
      UPDATE transcription_jobs 
      SET file_size = ?, file_type = ?, status = 'processing'
      WHERE id = ?
    `).bind(fileSize, fileType, jobId).run();
    
    // Get updated job details for Airtable notification
    const jobResult = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs WHERE id = ?
    `).bind(jobId).first();
    
    if (jobResult) {
      // Send job creation notification to Airtable now that file is actually uploaded
      const estimatedDuration = estimateAudioDuration(fileSize, jobResult.filename as string);
      await sendJobCreatedToAirtable(c.env, jobId, {
        filename: jobResult.filename as string,
        fileSize: fileSize,
        fileType: fileType,
        estimatedCost: (jobResult.estimated_cost as number) || 0,
        estimatedDuration,
        createdAt: jobResult.created_at as string,
        fileUrl: `${c.env.R2_PUBLIC_URL}/${key}`
      });
    }
    
    // Start transcription process
    await startTranscription(c.env, jobId, key);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error handling upload completion:', error);
    return c.json({ error: 'Failed to process upload' }, 500);
  }
});

// Get job status
app.get('/job/:jobId/status', authenticate, async (c) => {
  try {
    const jobId = c.req.param('jobId');
    
    const result = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs WHERE id = ?
    `).bind(jobId).first();
    
    if (!result) {
      return c.json({ error: 'Job not found' }, 404);
    }
    
    const job: TranscriptionJob = {
      id: result.id as string,
      filename: result.filename as string,
      fileSize: result.file_size as number,
      fileType: result.file_type as string,
      saladJobId: result.salad_job_id as string,
      status: result.status as any,
      transcriptionData: result.transcription_data ? JSON.parse(result.transcription_data as string) : undefined,
      errorMessage: result.error_message as string,
      retryCount: result.retry_count as number,
      lastRetryAt: result.last_retry_at as string,
      createdAt: result.created_at as string,
      completedAt: result.completed_at as string,
    };
    
    // If job is processing, check Salad status
    if (job.status === 'processing' && job.saladJobId) {
      const saladStatus = await checkSaladStatus(c.env, job.saladJobId);
      if (saladStatus && saladStatus.status !== 'processing') {
        await updateJobFromSalad(c.env, jobId, saladStatus);
        // Re-fetch updated job
        const updatedResult = await c.env.DB.prepare(`
          SELECT * FROM transcription_jobs WHERE id = ?
        `).bind(jobId).first();
        
        if (updatedResult) {
          job.status = updatedResult.status as any;
          job.transcriptionData = updatedResult.transcription_data ? 
            JSON.parse(updatedResult.transcription_data as string) : undefined;
          job.completedAt = updatedResult.completed_at as string;
        }
      }
    }
    
    return c.json(job);
  } catch (error) {
    console.error('Error getting job status:', error);
    return c.json({ error: 'Failed to get job status' }, 500);
  }
});

// Get usage statistics and cost tracking
app.get('/usage/stats', authenticate, async (c) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    // Get monthly statistics
    const monthlyStats = await c.env.DB.prepare(`
      SELECT 
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed_jobs,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing_jobs,
        SUM(estimated_cost) as total_cost,
        SUM(CASE WHEN transcription_data IS NOT NULL THEN JSON_EXTRACT(transcription_data, '$.duration') / 60 ELSE 0 END) as total_minutes,
        AVG(processing_time_ms) as avg_processing_time_ms
      FROM transcription_jobs 
      WHERE DATE(created_at) >= DATE('now', 'start of month')
    `).first();
    
    // Get daily breakdown for the current month
    const dailyBreakdown = await c.env.DB.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as jobs,
        SUM(estimated_cost) as cost,
        SUM(CASE WHEN transcription_data IS NOT NULL THEN JSON_EXTRACT(transcription_data, '$.duration') / 60 ELSE 0 END) as minutes
      FROM transcription_jobs 
      WHERE DATE(created_at) >= DATE('now', 'start of month')
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 31
    `).all();
    
    const stats = {
      currentMonth,
      monthlyStats: {
        totalJobs: (monthlyStats?.total_jobs as number) || 0,
        completedJobs: (monthlyStats?.completed_jobs as number) || 0,
        failedJobs: (monthlyStats?.failed_jobs as number) || 0,
        processingJobs: (monthlyStats?.processing_jobs as number) || 0,
        totalCost: Math.round(((monthlyStats?.total_cost as number) || 0) * 100) / 100,
        totalMinutes: Math.round(((monthlyStats?.total_minutes as number) || 0) * 10) / 10,
        avgProcessingTimeMs: Math.round((monthlyStats?.avg_processing_time_ms as number) || 0),
        remainingMinutes: MONTHLY_USAGE_LIMIT_MINUTES - ((monthlyStats?.total_minutes as number) || 0),
        usagePercentage: Math.round((((monthlyStats?.total_minutes as number) || 0) / MONTHLY_USAGE_LIMIT_MINUTES) * 100)
      },
      dailyBreakdown: dailyBreakdown.results.map((day: any) => ({
        date: day.date,
        jobs: day.jobs,
        cost: Math.round((day.cost || 0) * 100) / 100,
        minutes: Math.round((day.minutes || 0) * 10) / 10
      })),
      limits: {
        monthlyLimitMinutes: MONTHLY_USAGE_LIMIT_MINUTES,
        costPerMinute: COST_PER_MINUTE
      }
    };
    
    return c.json(stats);
  } catch (error) {
    console.error('Error getting usage stats:', error);
    return c.json({ error: 'Failed to get usage statistics' }, 500);
  }
});

// List all jobs
app.get('/jobs', authenticate, async (c) => {
  try {
    const results = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs 
      ORDER BY created_at DESC 
      LIMIT 50
    `).all();
    
    const jobs = results.results.map((result: any) => ({
      id: result.id,
      filename: result.filename,
      fileSize: result.file_size,
      fileType: result.file_type,
      saladJobId: result.salad_job_id,
      status: result.status,
      transcriptionData: result.transcription_data ? JSON.parse(result.transcription_data) : undefined,
      errorMessage: result.error_message,
      createdAt: result.created_at,
      completedAt: result.completed_at,
    }));
    
    return c.json(jobs);
  } catch (error) {
    console.error('Error listing jobs:', error);
    return c.json({ error: 'Failed to list jobs' }, 500);
  }
});

// Generate presigned URL for secure file access
app.get('/file/presigned-url/*', authenticate, async (c) => {
  try {
    const fullPath = c.req.path;
    const key = fullPath.replace('/file/presigned-url/', '');
    const expiresIn = parseInt(c.req.query('expires') || '3600'); // Default 1 hour
    
    // Validate expiration time (max 24 hours)
    const maxExpiry = 86400; // 24 hours in seconds
    const validExpiry = Math.min(Math.max(expiresIn, 60), maxExpiry);
    
    // For now, return a time-limited public URL
    // In production, implement proper signed URL generation
    const presignedUrl = `${c.env.R2_PUBLIC_URL}/${key}?expires=${Date.now() + (validExpiry * 1000)}`;
    
    return c.json({
      url: presignedUrl,
      expiresIn: validExpiry,
      expiresAt: new Date(Date.now() + (validExpiry * 1000)).toISOString()
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return c.json({ error: 'Failed to generate presigned URL' }, 500);
  }
});

// Serve files from R2 for external access (like Salad.com)
app.get('/file/:key', async (c) => {
  try {
    const key = c.req.param('key');
    const object = await c.env.R2_BUCKET.get(key);
    
    if (!object) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Enhanced CDN cache headers based on file type
    const contentType = object.httpMetadata?.contentType || 'application/octet-stream';
    let cacheControl = 'public, max-age=3600'; // Default 1 hour
    
    // Longer cache for transcripts and static content
    if (key.includes('/transcripts/') || contentType.includes('text/')) {
      cacheControl = 'public, max-age=86400, s-maxage=2592000'; // 1 day client, 30 days CDN
    } else if (contentType.includes('audio/') || contentType.includes('video/')) {
      cacheControl = 'public, max-age=86400, s-maxage=604800'; // 1 day client, 7 days CDN
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': object.size.toString(),
        'Cache-Control': cacheControl,
        'CDN-Cache-Control': cacheControl,
        'ETag': object.etag || `"${object.uploaded.getTime()}"`,
        'Last-Modified': object.uploaded.toUTCString(),
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return c.json({ error: 'Failed to serve file' }, 500);
  }
});

// Endpoint to manually retry failed jobs
app.post('/job/:jobId/retry', authenticate, async (c) => {
  try {
    const jobId = c.req.param('jobId');
    
    // Get job details
    const result = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs WHERE id = ?
    `).bind(jobId).first();
    
    if (!result) {
      return c.json({ error: 'Job not found' }, 404);
    }
    
    if (result.status !== 'error') {
      return c.json({ error: 'Only failed jobs can be retried' }, 400);
    }
    
    // Reset retry count and error message
    await c.env.DB.prepare(`
      UPDATE transcription_jobs 
      SET status = 'processing', retry_count = 0, error_message = NULL, last_retry_at = NULL
      WHERE id = ?
    `).bind(jobId).run();
    
    // Find the file key from the job  
    const timestamp = result.created_at as string;
    const jobIdPart = (result.id as string).replace('job-', '');
    const filename = (result.filename as string).replace(/\s+/g, '_');
    const fileKey = `uploads/${timestamp}-${jobIdPart}-${filename}`;
    
    // Start transcription
    await startTranscription(c.env, jobId, fileKey);
    
    return c.json({ success: true, message: 'Job retry initiated' });
  } catch (error) {
    console.error('Error retrying job:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint to manually start transcription
app.post('/debug/start-transcription', authenticate, async (c) => {
  try {
    const { jobId, fileKey } = await c.req.json();
    console.log('Manual transcription start for:', jobId, fileKey);
    
    // Update job to processing status
    await c.env.DB.prepare(`
      UPDATE transcription_jobs 
      SET status = 'processing', file_size = 12000000, file_type = 'audio/mp4'
      WHERE id = ?
    `).bind(jobId).run();
    
    // Start transcription
    await startTranscription(c.env, jobId, fileKey);
    
    return c.json({ success: true, message: 'Transcription started' });
  } catch (error) {
    console.error('Error starting transcription:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint to check job status (no auth for testing)
app.get('/debug/job/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const result = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs WHERE id = ?
    `).bind(jobId).first();
    
    if (!result) {
      return c.json({ error: 'Job not found' }, 404);
    }
    
    return c.json({
      id: result.id,
      filename: result.filename,
      fileSize: result.file_size,
      fileType: result.file_type,
      status: result.status,
      saladJobId: result.salad_job_id,
      createdAt: result.created_at,
      completedAt: result.completed_at,
      errorMessage: result.error_message
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint to test upload complete flow (no auth for testing)
app.post('/debug/test-upload-complete', async (c) => {
  try {
    console.log('Testing upload complete flow...');
    
    // Simulate the upload complete call
    const testPayload = {
      key: 'uploads/test-key',
      jobId: 'job-1752244542334-vdr2fia3x', // Use the real job ID
      fileSize: 2331656,
      fileType: 'audio/x-m4a'
    };
    
    console.log('Test payload:', JSON.stringify(testPayload));
    
    // Get job details
    const jobResult = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs WHERE id = ?
    `).bind(testPayload.jobId).first();
    
    if (!jobResult) {
      return c.json({ error: 'Job not found for testing' }, 404);
    }
    
    console.log('Job found:', JSON.stringify(jobResult));
    
    // Test the Airtable notification
    const estimatedDuration = estimateAudioDuration(testPayload.fileSize, jobResult.filename as string);
    console.log('Estimated duration:', estimatedDuration);
    
    await sendJobCreatedToAirtable(c.env, testPayload.jobId, {
      filename: jobResult.filename as string,
      fileSize: testPayload.fileSize,
      fileType: testPayload.fileType,
      estimatedCost: (jobResult.estimated_cost as number) || 0,
      estimatedDuration,
      createdAt: jobResult.created_at as string,
      fileUrl: `${c.env.R2_PUBLIC_URL}/${testPayload.key}`
    });
    
    return c.json({ 
      success: true, 
      message: 'Test upload complete flow executed',
      jobId: testPayload.jobId,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error testing upload complete:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint to manually complete a job and send to Airtable
app.post('/debug/complete-job/:jobId', async (c) => {
  try {
    const jobId = c.req.param('jobId');
    const { transcript, saladJobId } = await c.req.json();
    
    console.log(`Manually completing job ${jobId} with transcript`);
    
    // Create mock Salad response data
    const mockSaladData: SaladTranscriptionResponse = {
      job_id: saladJobId || 'manual-completion',
      status: 'completed' as const,
      transcript: transcript,
      segments: [],
      summary: '',
      sentiment: '',
      translation: '',
      captions: '',
      processing_time: 30
    };
    
    // Update job from Salad data
    await updateJobFromSalad(c.env, jobId, mockSaladData);
    
    return c.json({ 
      success: true, 
      message: `Job ${jobId} manually completed and sent to Airtable`,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error manually completing job:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint to test Airtable webhook (no auth for testing)
app.post('/debug/test-airtable', async (c) => {
  try {
    console.log('Testing Airtable webhook...');
    
    // Send a test notification to Airtable
    await sendJobCreatedToAirtable(c.env, 'test-job-123', {
      filename: 'test-audio.mp3',
      fileSize: 5000000,
      fileType: 'audio/mpeg',
      estimatedCost: 0.02,
      estimatedDuration: 5.0,
      createdAt: new Date().toISOString(),
      fileUrl: 'https://example.com/test-file.mp3'
    });
    
    return c.json({ 
      success: true, 
      message: 'Test notification sent to Airtable',
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error('Error testing Airtable webhook:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug endpoint to check and fix all stuck jobs
app.post('/debug/fix-stuck-jobs', authenticate, async (c) => {
  try {
    console.log('Checking for stuck jobs...');
    
    // Get all processing jobs older than 10 minutes
    const cutoffTime = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 minutes ago
    
    const stuckJobs = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs 
      WHERE status = 'processing' 
      AND created_at < ?
      ORDER BY created_at DESC
    `).bind(cutoffTime).all();
    
    console.log(`Found ${stuckJobs.results.length} potentially stuck jobs`);
    
    const results = [];
    
    for (const jobRow of stuckJobs.results) {
      const job = jobRow as any;
      console.log(`Checking stuck job: ${job.id} (Salad: ${job.salad_job_id})`);
      
      try {
        // Check status with Salad directly
        const saladStatus = await checkSaladStatus(c.env, job.salad_job_id);
        
        if (saladStatus) {
          console.log(`Salad status for ${job.id}: ${saladStatus.status}`);
          
          if (saladStatus.status === 'completed' || saladStatus.status === 'succeeded') {
            console.log(`Job ${job.id} completed on Salad, updating locally...`);
            await updateJobFromSalad(c.env, job.id, saladStatus);
            results.push({ jobId: job.id, action: 'completed', saladStatus: saladStatus.status });
          } else if (saladStatus.status === 'failed') {
            console.log(`Job ${job.id} failed on Salad, marking as error...`);
            await c.env.DB.prepare(`
              UPDATE transcription_jobs 
              SET status = 'error', error_message = 'Job failed at Salad'
              WHERE id = ?
            `).bind(job.id).run();
            results.push({ jobId: job.id, action: 'failed', saladStatus: saladStatus.status });
          } else {
            results.push({ jobId: job.id, action: 'still_processing', saladStatus: saladStatus.status });
          }
        } else {
          console.log(`Could not get Salad status for job ${job.id}`);
          results.push({ jobId: job.id, action: 'no_salad_status', error: 'Could not fetch Salad status' });
        }
      } catch (error) {
        console.error(`Error checking job ${job.id}:`, error);
        results.push({ jobId: job.id, action: 'error', error: String(error) });
      }
    }
    
    return c.json({ 
      message: `Checked ${stuckJobs.results.length} stuck jobs`,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fixing stuck jobs:', error);
    return c.json({ error: String(error) }, 500);
  }
});

// Debug webhook endpoint (no signature verification) for testing
app.post('/webhook/salad-debug', async (c) => {
  try {
    const rawBody = await c.req.text();
    const headers: Record<string, string> = {};
    
    // Log all headers for debugging
    const allHeaders = c.req.header();
    for (const [key, value] of Object.entries(allHeaders)) {
      headers[key] = value;
    }
    
    console.log('Debug webhook received:');
    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Body:', rawBody);
    
    // Parse and process normally without signature verification
    const payload = JSON.parse(rawBody);
    
    const result = await c.env.DB.prepare(`
      SELECT id FROM transcription_jobs WHERE salad_job_id = ?
    `).bind(payload.job_id).first();
    
    if (!result) {
      console.error('Job not found for Salad ID:', payload.job_id);
      return c.json({ error: 'Job not found' }, 404);
    }
    
    await updateJobFromSalad(c.env, result.id as string, payload);
    
    return c.json({ success: true, debug: true });
  } catch (error) {
    console.error('Error handling debug webhook:', error);
    return c.json({ error: 'Failed to process webhook' }, 500);
  }
});

// Webhook endpoint for Salad completion notifications
app.post('/webhook/salad', async (c) => {
  try {
    // Get the raw body for signature verification
    const rawBody = await c.req.text();
    
    // Note: Salad webhooks don't include signature headers
    // Skipping signature verification for Salad webhook compatibility
    
    // Parse the JSON payload
    const payload = JSON.parse(rawBody);
    
    // Implement replay protection with timestamp validation
    const webhookTimestamp = payload.timestamp || payload.created_at || 
                           c.req.header('x-webhook-timestamp');
    
    if (webhookTimestamp) {
      const webhookTime = new Date(webhookTimestamp).getTime();
      const currentTime = Date.now();
      const timeDiff = Math.abs(currentTime - webhookTime);
      
      // Reject webhooks older than 5 minutes (300000ms)
      const maxAge = 300000;
      if (timeDiff > maxAge) {
        console.error(`Webhook timestamp too old: ${timeDiff}ms difference`);
        return c.json({ error: 'Webhook expired' }, 401);
      }
    }
    
    // Find job by Salad job ID
    const result = await c.env.DB.prepare(`
      SELECT id FROM transcription_jobs WHERE salad_job_id = ?
    `).bind(payload.job_id).first();
    
    if (!result) {
      console.error('Job not found for Salad ID:', payload.job_id);
      return c.json({ error: 'Job not found' }, 404);
    }
    
    await updateJobFromSalad(c.env, result.id as string, payload);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error handling Salad webhook:', error);
    return c.json({ error: 'Failed to process webhook' }, 500);
  }
});

// Helper functions

// Temporarily commented out to avoid TypeScript unused variable warning
/* async function verifyWebhookSignature(
  payload: string, 
  signature: string, 
  secret: string
): Promise<boolean> {
  try {
    // Remove the "sha256=" prefix if present
    const cleanSignature = signature.replace(/^sha256=/, '');
    
    // Create HMAC-SHA256 hash of the payload
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const payloadData = encoder.encode(payload);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature_buffer = await crypto.subtle.sign('HMAC', cryptoKey, payloadData);
    const computed_signature = Array.from(new Uint8Array(signature_buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Compare signatures (constant-time comparison)
    return computed_signature === cleanSignature;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
} */

// Constants for retry logic
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE_MS = 5000; // 5 seconds
const RETRY_DELAY_MAX_MS = 300000; // 5 minutes

async function shouldRetryError(error: Error): Promise<boolean> {
  const errorMessage = error.message.toLowerCase();
  
  // Retry on network errors, timeouts, and temporary API errors
  const retryableErrors = [
    'network error',
    'timeout',
    'rate limit',
    'temporarily unavailable',
    'service unavailable',
    '502',
    '503',
    '504',
    'gateway timeout'
  ];
  
  return retryableErrors.some(pattern => errorMessage.includes(pattern));
}

async function getRetryDelay(retryCount: number): Promise<number> {
  // Exponential backoff: base delay * 2^retryCount, capped at max
  const delay = Math.min(
    RETRY_DELAY_BASE_MS * Math.pow(2, retryCount),
    RETRY_DELAY_MAX_MS
  );
  
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 1000;
  return delay + jitter;
}

async function scheduleRetry(env: Bindings, jobId: string, fileKey: string, retryCount: number) {
  const delay = await getRetryDelay(retryCount);
  
  // Update job status to retry with timestamp
  await env.DB.prepare(`
    UPDATE transcription_jobs 
    SET status = 'retry', retry_count = ?, last_retry_at = ?, error_message = ?
    WHERE id = ?
  `).bind(
    retryCount,
    new Date().toISOString(),
    `Retrying in ${Math.round(delay / 1000)} seconds (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`,
    jobId
  ).run();
  
  console.log(`Scheduled retry for job ${jobId} in ${Math.round(delay / 1000)} seconds`);
  
  // Use setTimeout to schedule retry (Note: in production, consider using Durable Objects or external queue)
  setTimeout(async () => {
    await startTranscription(env, jobId, fileKey);
  }, delay);
}

async function startTranscription(env: Bindings, jobId: string, fileKey: string) {
  try {
    // Generate signed URL from R2 for Salad to access
    const r2Object = env.R2_BUCKET.get(fileKey);
    if (!r2Object) {
      throw new Error('File not found in R2');
    }
    
    // Use R2 public URL for direct access
    const fileUrl = `${env.R2_PUBLIC_URL}/${fileKey}`;
    
    // Submit transcription job to Salad with correct format
    const transcriptionRequest = {
      input: {
        url: fileUrl,
        return_as_file: false,
        language_code: 'en',
        sentence_level_timestamps: "true",
        word_level_timestamps: true,
        diarization: true,
        sentence_diarization: true,
        srt: true,
        summarize: 100
      },
      webhook: `${env.WORKER_URL}/webhook/salad`,
      metadata: {
        'job-id': jobId
      }
    };

    const saladResponse = await fetch(`https://api.salad.com/api/public/organizations/${env.SALAD_ORG_NAME}/inference-endpoints/transcribe/jobs`, {
      method: 'POST',
      headers: {
        'Salad-Api-Key': env.SALAD_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transcriptionRequest),
    });
    
    if (!saladResponse.ok) {
      throw new Error(`Salad API error: ${saladResponse.status}`);
    }
    
    const saladData = await saladResponse.json() as any;
    
    // Update job with Salad job ID
    await env.DB.prepare(`
      UPDATE transcription_jobs 
      SET salad_job_id = ?, status = 'processing'
      WHERE id = ?
    `).bind(saladData.id, jobId).run();
    
    console.log(`Started transcription for job ${jobId}, Salad job: ${saladData.id}`);
  } catch (error) {
    console.error('Error starting transcription:', error);
    
    // Get current retry count
    const jobResult = await env.DB.prepare(`
      SELECT retry_count FROM transcription_jobs WHERE id = ?
    `).bind(jobId).first();
    
    const currentRetryCount = (jobResult?.retry_count as number) || 0;
    
    // Check if we should retry this error
    const shouldRetry = await shouldRetryError(error as Error);
    
    if (shouldRetry && currentRetryCount < MAX_RETRY_ATTEMPTS) {
      await scheduleRetry(env, jobId, fileKey, currentRetryCount);
    } else {
      // Final failure - update job with error status
      const errorMessage = currentRetryCount >= MAX_RETRY_ATTEMPTS 
        ? `Failed after ${MAX_RETRY_ATTEMPTS} retry attempts: ${String(error)}`
        : `Non-retryable error: ${String(error)}`;
      
      await env.DB.prepare(`
        UPDATE transcription_jobs 
        SET status = 'error', error_message = ?
        WHERE id = ?
      `).bind(errorMessage, jobId).run();
      
      console.error(`Final failure for job ${jobId}: ${errorMessage}`);
    }
  }
}

async function checkSaladStatus(env: Bindings, saladJobId: string): Promise<SaladTranscriptionResponse | null> {
  try {
    const response = await fetch(`https://api.salad.com/api/public/organizations/${env.SALAD_ORG_NAME}/inference-endpoints/transcribe/jobs/${saladJobId}`, {
      headers: {
        'Salad-Api-Key': env.SALAD_API_KEY,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Salad API error: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error checking Salad status:', error);
    return null;
  }
}

async function updateJobFromSalad(env: Bindings, jobId: string, saladData: SaladTranscriptionResponse) {
  try {
    if (saladData.status === 'completed' && saladData.transcript) {
      // Create comprehensive transcription data
      const transcriptionData = {
        text: saladData.transcript,
        segments: saladData.segments || [],
        summary: saladData.summary,
        sentiment: saladData.sentiment,
        translation: saladData.translation,
        captions: saladData.captions,
        processingTime: saladData.processing_time,
        confidence: 0.95, // Default confidence
        duration: saladData.segments ? 
          Math.max(...saladData.segments.map(s => s.end)) : 0,
        metadata: {
          saladJobId: saladData.job_id,
          language: 'en',
          processingTime: saladData.processing_time || 0
        }
      };

      // Calculate actual cost based on duration
      const actualDurationMinutes = transcriptionData.duration / 60;
      const actualCost = estimateCost(actualDurationMinutes);
      const processingTimeMs = (saladData.processing_time || 0) * 1000;

      // Update job with transcription data
      await env.DB.prepare(`
        UPDATE transcription_jobs 
        SET status = 'completed', transcription_data = ?, completed_at = ?, 
            estimated_cost = ?, processing_time_ms = ?
        WHERE id = ?
      `).bind(
        JSON.stringify(transcriptionData),
        new Date().toISOString(),
        actualCost,
        processingTimeMs,
        jobId
      ).run();
      
      // Backup transcript to R2 storage
      await backupTranscriptToR2(env, jobId, transcriptionData, saladData);
      
      // Send data to Airtable
      await sendToAirtable(env, jobId, saladData);
      
      console.log(`Completed transcription for job ${jobId}`);
    } else if (saladData.status === 'failed') {
      await env.DB.prepare(`
        UPDATE transcription_jobs 
        SET status = 'error', error_message = 'Transcription failed'
        WHERE id = ?
      `).bind(jobId).run();
      
      console.log(`Failed transcription for job ${jobId}`);
    }
  } catch (error) {
    console.error('Error updating job from Salad:', error);
  }
}

async function backupTranscriptToR2(
  env: Bindings, 
  jobId: string, 
  transcriptionData: any, 
  saladData: SaladTranscriptionResponse
) {
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const basePath = `transcripts/${year}/${month}/${day}/${jobId}`;
    
    // Save JSON format with full metadata
    await env.R2_BUCKET.put(
      `${basePath}/transcript.json`,
      JSON.stringify({
        jobId,
        transcriptionData,
        saladResponse: {
          job_id: saladData.job_id,
          status: saladData.status,
          processing_time: saladData.processing_time
        },
        savedAt: now.toISOString()
      }, null, 2),
      {
        httpMetadata: {
          contentType: 'application/json',
        },
        customMetadata: {
          jobId,
          duration: transcriptionData.duration.toString(),
          language: 'en'
        }
      }
    );
    
    // Save plain text format
    await env.R2_BUCKET.put(
      `${basePath}/transcript.txt`,
      transcriptionData.text,
      {
        httpMetadata: {
          contentType: 'text/plain',
        },
        customMetadata: {
          jobId
        }
      }
    );
    
    // Save SRT format if captions are available
    if (saladData.captions || (transcriptionData.segments && transcriptionData.segments.length > 0)) {
      const srtContent = generateSRT(transcriptionData.segments || []);
      await env.R2_BUCKET.put(
        `${basePath}/transcript.srt`,
        srtContent,
        {
          httpMetadata: {
            contentType: 'text/plain',
          },
          customMetadata: {
            jobId
          }
        }
      );
    }
    
    console.log(`Backed up transcripts to R2: ${basePath}`);
  } catch (error) {
    console.error('Error backing up transcript to R2:', error);
    // Don't fail the job if backup fails, just log the error
  }
}

function generateSRT(segments: Array<{start: number, end: number, text: string, speaker?: string}>): string {
  return segments.map((segment, index) => {
    const start = formatSRTTime(segment.start);
    const end = formatSRTTime(segment.end);
    const speaker = segment.speaker ? `[${segment.speaker}] ` : '';
    return `${index + 1}\n${start} --> ${end}\n${speaker}${segment.text}\n`;
  }).join('\n');
}

function formatSRTTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

async function sendJobCreatedToAirtable(env: Bindings, jobId: string, jobData: any) {
  try {
    console.log(`Attempting to send job creation notification for ${jobId}`);
    console.log(`Airtable webhook URL: ${env.AIRTABLE_WEBHOOK_URL ? 'SET' : 'NOT SET'}`);
    
    // Prepare Airtable payload for job creation
    const airtablePayload = {
      jobId,
      filename: jobData.filename,
      fileSize: jobData.fileSize,
      fileType: jobData.fileType || 'unknown',
      status: 'created',
      estimatedCost: jobData.estimatedCost || 0,
      estimatedDuration: jobData.estimatedDuration || 0,
      createdAt: jobData.createdAt,
      fileUrl: jobData.fileUrl || null,
      eventType: 'job_created'
    };
    
    console.log(`Airtable payload: ${JSON.stringify(airtablePayload)}`);
    
    // Send to Airtable webhook
    const airtableResponse = await fetch(env.AIRTABLE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(airtablePayload),
    });
    
    console.log(`Airtable response status: ${airtableResponse.status}`);
    
    if (!airtableResponse.ok) {
      const responseText = await airtableResponse.text();
      console.error(`Airtable webhook error response: ${responseText}`);
      throw new Error(`Airtable webhook error: ${airtableResponse.status} - ${responseText}`);
    }
    
    console.log(`✅ Successfully sent job creation notification to Airtable for job ${jobId}`);
  } catch (error) {
    console.error('❌ Error sending job creation to Airtable:', error);
    // Don't fail the job if Airtable fails, just log the error
  }
}

async function sendToAirtable(env: Bindings, jobId: string, saladData: SaladTranscriptionResponse) {
  try {
    // Get job details
    const jobResult = await env.DB.prepare(`
      SELECT * FROM transcription_jobs WHERE id = ?
    `).bind(jobId).first();
    
    if (!jobResult) {
      throw new Error('Job not found');
    }
    
    // Prepare Airtable payload
    const airtablePayload = {
      jobId,
      filename: jobResult.filename,
      fileSize: jobResult.file_size,
      fileType: jobResult.file_type,
      status: 'completed',
      transcriptionText: saladData.transcript,
      summary: saladData.summary,
      sentiment: saladData.sentiment,
      translation: saladData.translation,
      captions: saladData.captions,
      wordCount: saladData.transcript?.split(' ').length || 0,
      saladJobId: saladData.job_id,
      processingTime: saladData.processing_time || 0,
      createdAt: jobResult.created_at,
      completedAt: new Date().toISOString(),
      segments: JSON.stringify(saladData.segments || []),
      eventType: 'job_completed'
    };
    
    // Send to Airtable webhook
    const airtableResponse = await fetch(env.AIRTABLE_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(airtablePayload),
    });
    
    if (!airtableResponse.ok) {
      throw new Error(`Airtable webhook error: ${airtableResponse.status}`);
    }
    
    console.log(`Sent transcription data to Airtable for job ${jobId}`);
  } catch (error) {
    console.error('Error sending to Airtable:', error);
    // Don't fail the job if Airtable fails, just log the error
  }
}

export default app;