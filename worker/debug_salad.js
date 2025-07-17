// Debug script to manually check Salad job status and trigger updates
const jobId = 'job-1752782411362-fkobdp5wc';
const saladJobId = '6cbc9da1-879f-4fde-8b10-feee559dee89';
const workerUrl = 'https://transcription-worker.mike-522.workers.dev';

// You'll need to set your ACCESS_TOKEN as an environment variable
const accessToken = process.env.ACCESS_TOKEN;

if (!accessToken) {
  console.error('Please set ACCESS_TOKEN environment variable');
  process.exit(1);
}

async function checkJobStatus() {
  try {
    console.log(`Checking status for job ${jobId}...`);
    
    const response = await fetch(`${workerUrl}/job/${jobId}/status`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const jobData = await response.json();
    console.log('Job Status:', JSON.stringify(jobData, null, 2));
    
    return jobData;
  } catch (error) {
    console.error('Error checking job status:', error.message);
  }
}

async function checkSaladEndpoints() {
  try {
    console.log('Checking available Salad endpoints...');
    
    const response = await fetch(`${workerUrl}/debug/salad-endpoints`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const endpoints = await response.json();
    console.log('Salad Endpoints:', JSON.stringify(endpoints, null, 2));
    
    return endpoints;
  } catch (error) {
    console.error('Error checking Salad endpoints:', error.message);
  }
}

async function main() {
  console.log('=== Debugging Salad Transcription Jobs ===\n');
  
  // Check Salad endpoints first
  await checkSaladEndpoints();
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Check job status (this should trigger Salad status check if job is processing)
  await checkJobStatus();
}

main().catch(console.error);