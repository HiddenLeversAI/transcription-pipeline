// Script to trigger status checks for stuck jobs via worker API
const workerUrl = 'https://transcription-worker.mike-522.workers.dev';

// You'll need to set your ACCESS_TOKEN as an environment variable
const accessToken = process.env.ACCESS_TOKEN;

if (!accessToken) {
  console.error('Please set ACCESS_TOKEN environment variable');
  process.exit(1);
}

const stuckJobs = [
  { jobId: 'job-1752782411362-fkobdp5wc', saladJobId: '6cbc9da1-879f-4fde-8b10-feee559dee89' },
  { jobId: 'job-1752784108290-c4wmi7yav', saladJobId: 'edca82a2-7014-41dc-be34-d284f4bf8019' }
];

async function checkJobStatus(jobId) {
  try {
    console.log(`\nChecking status for job ${jobId} via worker...`);
    
    const response = await fetch(`${workerUrl}/job/${jobId}/status`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error Response: ${errorText}`);
      return null;
    }
    
    const jobData = await response.json();
    console.log('Job Status:', JSON.stringify(jobData, null, 2));
    
    return jobData;
  } catch (error) {
    console.error(`Error checking job ${jobId}:`, error.message);
    return null;
  }
}

async function getAllJobs() {
  try {
    console.log('\nGetting all jobs via worker...');
    
    const response = await fetch(`${workerUrl}/jobs`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error Response: ${errorText}`);
      return null;
    }
    
    const jobs = await response.json();
    console.log(`Found ${jobs.length} jobs`);
    
    // Filter processing jobs
    const processingJobs = jobs.filter(job => job.status === 'processing');
    console.log(`Processing jobs: ${processingJobs.length}`);
    
    processingJobs.forEach(job => {
      console.log(`- ${job.id} (${job.filename}) - Salad: ${job.saladJobId || 'None'} - Created: ${job.createdAt}`);
    });
    
    return jobs;
  } catch (error) {
    console.error('Error getting all jobs:', error.message);
    return null;
  }
}

async function getUsageStats() {
  try {
    console.log('\nGetting usage stats...');
    
    const response = await fetch(`${workerUrl}/usage/stats`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error Response: ${errorText}`);
      return null;
    }
    
    const stats = await response.json();
    console.log('Usage Stats:', JSON.stringify(stats, null, 2));
    
    return stats;
  } catch (error) {
    console.error('Error getting usage stats:', error.message);
    return null;
  }
}

async function retryJob(jobId) {
  try {
    console.log(`\nAttempting to retry job ${jobId}...`);
    
    const response = await fetch(`${workerUrl}/job/${jobId}/retry`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error Response: ${errorText}`);
      return null;
    }
    
    const result = await response.json();
    console.log('Retry Result:', JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error(`Error retrying job ${jobId}:`, error.message);
    return null;
  }
}

async function main() {
  console.log('=== Worker API Investigation ===');
  
  // Get usage stats first
  await getUsageStats();
  
  // Get all jobs overview
  await getAllJobs();
  
  // Check each stuck job individually (this should trigger Salad status checks)
  for (const job of stuckJobs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Investigating stuck job: ${job.jobId}`);
    
    // Check status (this will trigger Salad API call in the worker)
    const jobData = await checkJobStatus(job.jobId);
    
    if (jobData && jobData.status === 'processing') {
      console.log(`⚠️  Job ${job.jobId} is still stuck in processing status`);
      
      // Note: Only retry if status is 'error', but we can check the job again
      console.log('Checking status again in 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      await checkJobStatus(job.jobId);
    } else if (jobData) {
      console.log(`✅ Job ${job.jobId} status updated to: ${jobData.status}`);
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('Investigation complete!');
}

main().catch(console.error);