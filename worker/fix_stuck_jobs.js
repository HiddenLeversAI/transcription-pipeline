// Script to diagnose and fix stuck transcription jobs
const workerUrl = 'https://transcription-worker.mike-522.workers.dev';
const SALAD_ORG_NAME = 'leverage';

// You'll need to set these as environment variables
const accessToken = process.env.ACCESS_TOKEN;
const saladApiKey = process.env.SALAD_API_KEY;

if (!accessToken || !saladApiKey) {
  console.error('Please set ACCESS_TOKEN and SALAD_API_KEY environment variables');
  process.exit(1);
}

const stuckJobs = [
  { jobId: 'job-1752782411362-fkobdp5wc', saladJobId: '6cbc9da1-879f-4fde-8b10-feee559dee89' },
  { jobId: 'job-1752784108290-c4wmi7yav', saladJobId: 'edca82a2-7014-41dc-be34-d284f4bf8019' }
];

async function checkSaladJobDirect(saladJobId) {
  try {
    const url = `https://api.salad.com/api/public/organizations/${SALAD_ORG_NAME}/inference-endpoints/transcribe/jobs/${saladJobId}`;
    
    const response = await fetch(url, {
      headers: {
        'Salad-Api-Key': saladApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Salad API Error for ${saladJobId}: ${response.status} - ${errorText}`);
      return null;
    }
    
    const jobData = await response.json();
    return jobData;
  } catch (error) {
    console.error(`❌ Error checking Salad job ${saladJobId}:`, error.message);
    return null;
  }
}

async function manuallyCompleteJob(jobId, saladData) {
  try {
    console.log(`🔧 Manually completing job ${jobId}...`);
    
    const response = await fetch(`${workerUrl}/debug/complete-job/${jobId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        transcript: saladData.transcript || saladData.output?.transcript || 'Manual completion - transcript not available',
        saladJobId: saladData.id
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error manually completing job: ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`✅ Successfully completed job ${jobId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error manually completing job ${jobId}:`, error.message);
    return false;
  }
}

async function simulateWebhook(jobId, saladJobId, saladData) {
  try {
    console.log(`🔧 Simulating webhook for job ${jobId}...`);
    
    // Use the debug webhook endpoint to simulate Salad completion
    const webhookPayload = {
      job_id: saladJobId,
      status: saladData.status || 'completed',
      transcript: saladData.transcript || saladData.output?.transcript,
      segments: saladData.segments || saladData.output?.segments || [],
      summary: saladData.summary || saladData.output?.summary,
      sentiment: saladData.sentiment || saladData.output?.sentiment,
      translation: saladData.translation || saladData.output?.translation,
      captions: saladData.captions || saladData.output?.captions,
      processing_time: saladData.processing_time || 30,
      timestamp: new Date().toISOString()
    };
    
    const response = await fetch(`${workerUrl}/webhook/salad-debug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(webhookPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error simulating webhook: ${errorText}`);
      return false;
    }
    
    const result = await response.json();
    console.log(`✅ Successfully simulated webhook for job ${jobId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error simulating webhook for job ${jobId}:`, error.message);
    return false;
  }
}

async function checkWorkerJobStatus(jobId) {
  try {
    const response = await fetch(`${workerUrl}/job/${jobId}/status`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Error checking worker job status: ${errorText}`);
      return null;
    }
    
    const jobData = await response.json();
    return jobData;
  } catch (error) {
    console.error(`❌ Error checking worker job ${jobId}:`, error.message);
    return null;
  }
}

async function diagnoseAndFixJob(job) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 DIAGNOSING JOB: ${job.jobId}`);
  console.log(`   Salad ID: ${job.saladJobId}`);
  console.log(`${'='.repeat(80)}`);
  
  // Step 1: Check current worker status
  console.log('\n1️⃣ Checking current worker status...');
  const workerStatus = await checkWorkerJobStatus(job.jobId);
  if (workerStatus) {
    console.log(`   Worker Status: ${workerStatus.status}`);
    console.log(`   Created: ${workerStatus.createdAt}`);
    console.log(`   Salad Job ID: ${workerStatus.saladJobId || 'None'}`);
  }
  
  // Step 2: Check Salad status directly
  console.log('\n2️⃣ Checking Salad status directly...');
  const saladStatus = await checkSaladJobDirect(job.saladJobId);
  if (saladStatus) {
    console.log(`   Salad Status: ${saladStatus.status}`);
    console.log(`   Has transcript: ${!!(saladStatus.transcript || saladStatus.output?.transcript)}`);
    console.log(`   Processing time: ${saladStatus.processing_time || 'N/A'}`);
    
    // Step 3: Determine fix strategy
    console.log('\n3️⃣ Determining fix strategy...');
    
    if (saladStatus.status === 'completed' && (saladStatus.transcript || saladStatus.output?.transcript)) {
      console.log('   🎯 Strategy: Salad job is completed, simulate webhook to update worker');
      
      const webhookSuccess = await simulateWebhook(job.jobId, job.saladJobId, saladStatus);
      if (webhookSuccess) {
        // Verify the fix
        console.log('\n4️⃣ Verifying fix...');
        const updatedStatus = await checkWorkerJobStatus(job.jobId);
        if (updatedStatus && updatedStatus.status === 'completed') {
          console.log('   ✅ Job successfully fixed!');
        } else {
          console.log('   ⚠️  Webhook simulation didn\'t update status, trying manual completion...');
          await manuallyCompleteJob(job.jobId, saladStatus);
        }
      }
    } else if (saladStatus.status === 'failed') {
      console.log('   🎯 Strategy: Salad job failed, marking job as error');
      // Could implement error marking here
      console.log('   ❌ Job failed in Salad, manual intervention needed');
    } else if (saladStatus.status === 'processing') {
      console.log('   🎯 Strategy: Still processing in Salad, will wait');
      console.log('   ⏳ Job is still genuinely processing in Salad');
    } else {
      console.log(`   🎯 Strategy: Unknown Salad status "${saladStatus.status}", needs investigation`);
    }
  } else {
    console.log('   ❌ Could not retrieve Salad status');
    console.log('   🎯 Strategy: Salad job may not exist, consider retry');
  }
  
  return { workerStatus, saladStatus };
}

async function main() {
  console.log('🚀 STUCK JOBS DIAGNOSTIC AND FIX TOOL');
  console.log('=====================================');
  
  const results = [];
  
  for (const job of stuckJobs) {
    const result = await diagnoseAndFixJob(job);
    results.push({ job, ...result });
  }
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 SUMMARY');
  console.log(`${'='.repeat(80)}`);
  
  results.forEach(({ job, workerStatus, saladStatus }) => {
    console.log(`\n${job.jobId}:`);
    console.log(`  Worker: ${workerStatus?.status || 'Unknown'}`);
    console.log(`  Salad: ${saladStatus?.status || 'Unknown'}`);
    
    if (workerStatus?.status === 'completed') {
      console.log(`  Result: ✅ Fixed`);
    } else if (saladStatus?.status === 'completed') {
      console.log(`  Result: ⚠️  Needs webhook/manual completion`);
    } else if (saladStatus?.status === 'processing') {
      console.log(`  Result: ⏳ Still processing`);
    } else {
      console.log(`  Result: ❌ Needs manual intervention`);
    }
  });
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('🏁 Analysis complete!');
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('1. Check webhook endpoint is accessible: ' + workerUrl + '/webhook/salad');
  console.log('2. Monitor future jobs for similar webhook delivery issues');
  console.log('3. Consider implementing periodic status polling for stuck jobs');
  console.log('4. Verify Salad webhook configuration points to correct URL');
}

main().catch(console.error);