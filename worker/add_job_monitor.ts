// Addition to index.ts to add periodic job monitoring endpoint
// This can be called manually or via a cron job to check for stuck jobs

// Add this endpoint to the existing index.ts file

/*

// Endpoint to check for stuck jobs and attempt to resolve them
app.post('/admin/check-stuck-jobs', authenticate, async (c) => {
  try {
    const maxProcessingTimeMs = 10 * 60 * 1000; // 10 minutes
    const now = new Date();
    
    // Find jobs that have been processing for too long
    const stuckJobs = await c.env.DB.prepare(`
      SELECT * FROM transcription_jobs 
      WHERE status = 'processing' 
      AND salad_job_id IS NOT NULL
      AND (
        (created_at < datetime('now', '-10 minutes') AND completed_at IS NULL)
        OR
        (last_retry_at IS NOT NULL AND last_retry_at < datetime('now', '-10 minutes'))
      )
      ORDER BY created_at ASC
    `).all();
    
    const results = [];
    
    for (const job of stuckJobs.results) {
      const jobId = job.id as string;
      const saladJobId = job.salad_job_id as string;
      
      console.log(`Checking potentially stuck job: ${jobId} (Salad: ${saladJobId})`);
      
      try {
        // Check Salad status
        const saladStatus = await checkSaladStatus(c.env, saladJobId);
        
        if (saladStatus) {
          if (saladStatus.status === 'completed' && saladStatus.transcript) {
            console.log(`Found completed job ${jobId}, updating...`);
            await updateJobFromSalad(c.env, jobId, saladStatus);
            results.push({
              jobId,
              action: 'completed',
              saladStatus: saladStatus.status
            });
          } else if (saladStatus.status === 'failed') {
            console.log(`Found failed job ${jobId}, marking as error...`);
            await c.env.DB.prepare(`
              UPDATE transcription_jobs 
              SET status = 'error', error_message = 'Job failed in Salad'
              WHERE id = ?
            `).bind(jobId).run();
            results.push({
              jobId,
              action: 'marked_failed',
              saladStatus: saladStatus.status
            });
          } else {
            console.log(`Job ${jobId} still processing in Salad (status: ${saladStatus.status})`);
            results.push({
              jobId,
              action: 'still_processing',
              saladStatus: saladStatus.status
            });
          }
        } else {
          console.log(`Could not get Salad status for job ${jobId}`);
          results.push({
            jobId,
            action: 'salad_status_unknown',
            saladStatus: 'unknown'
          });
        }
      } catch (error) {
        console.error(`Error checking job ${jobId}:`, error);
        results.push({
          jobId,
          action: 'error',
          error: String(error)
        });
      }
    }
    
    const summary = {
      totalChecked: stuckJobs.results.length,
      completed: results.filter(r => r.action === 'completed').length,
      failed: results.filter(r => r.action === 'marked_failed').length,
      stillProcessing: results.filter(r => r.action === 'still_processing').length,
      errors: results.filter(r => r.action === 'error').length,
      checkTime: now.toISOString(),
      results
    };
    
    console.log('Stuck jobs check summary:', summary);
    
    return c.json(summary);
  } catch (error) {
    console.error('Error checking stuck jobs:', error);
    return c.json({ error: 'Failed to check stuck jobs' }, 500);
  }
});

// Endpoint to force refresh all processing jobs
app.post('/admin/refresh-processing-jobs', authenticate, async (c) => {
  try {
    const processingJobs = await c.env.DB.prepare(`
      SELECT id, salad_job_id FROM transcription_jobs 
      WHERE status = 'processing' AND salad_job_id IS NOT NULL
      ORDER BY created_at DESC
    `).all();
    
    const results = [];
    
    for (const job of processingJobs.results) {
      const jobId = job.id as string;
      const saladJobId = job.salad_job_id as string;
      
      const saladStatus = await checkSaladStatus(c.env, saladJobId);
      
      if (saladStatus && saladStatus.status !== 'processing') {
        await updateJobFromSalad(c.env, jobId, saladStatus);
        results.push({
          jobId,
          oldStatus: 'processing',
          newStatus: saladStatus.status
        });
      } else {
        results.push({
          jobId,
          oldStatus: 'processing',
          newStatus: saladStatus?.status || 'unknown'
        });
      }
    }
    
    return c.json({
      message: 'Refreshed all processing jobs',
      totalJobs: processingJobs.results.length,
      updated: results.filter(r => r.newStatus !== 'processing').length,
      results
    });
  } catch (error) {
    console.error('Error refreshing processing jobs:', error);
    return c.json({ error: 'Failed to refresh processing jobs' }, 500);
  }
});

*/