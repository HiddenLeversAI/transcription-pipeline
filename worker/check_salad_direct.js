// Script to directly check Salad API status for stuck jobs
const SALAD_ORG_NAME = 'leverage';

// You'll need to set your SALAD_API_KEY as an environment variable
const saladApiKey = process.env.SALAD_API_KEY;

if (!saladApiKey) {
  console.error('Please set SALAD_API_KEY environment variable');
  process.exit(1);
}

const stuckJobs = [
  { jobId: 'job-1752782411362-fkobdp5wc', saladJobId: '6cbc9da1-879f-4fde-8b10-feee559dee89' },
  { jobId: 'job-1752784108290-c4wmi7yav', saladJobId: 'edca82a2-7014-41dc-be34-d284f4bf8019' }
];

async function checkSaladJobDirect(saladJobId) {
  try {
    console.log(`\nChecking Salad job ${saladJobId} directly...`);
    
    const url = `https://api.salad.com/api/public/organizations/${SALAD_ORG_NAME}/inference-endpoints/transcribe/jobs/${saladJobId}`;
    console.log(`URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Salad-Api-Key': saladApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status}`);
    console.log(`Response Headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error Response: ${errorText}`);
      return null;
    }
    
    const jobData = await response.json();
    console.log('Salad Job Data:', JSON.stringify(jobData, null, 2));
    
    return jobData;
  } catch (error) {
    console.error(`Error checking Salad job ${saladJobId}:`, error.message);
    return null;
  }
}

async function listSaladJobs() {
  try {
    console.log('\nListing all Salad jobs...');
    
    const url = `https://api.salad.com/api/public/organizations/${SALAD_ORG_NAME}/inference-endpoints/transcribe/jobs`;
    console.log(`URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Salad-Api-Key': saladApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error Response: ${errorText}`);
      return null;
    }
    
    const jobsList = await response.json();
    console.log('Recent Salad Jobs:', JSON.stringify(jobsList, null, 2));
    
    return jobsList;
  } catch (error) {
    console.error('Error listing Salad jobs:', error.message);
    return null;
  }
}

async function checkSaladEndpoints() {
  try {
    console.log('\nChecking Salad inference endpoints...');
    
    const url = `https://api.salad.com/api/public/organizations/${SALAD_ORG_NAME}/inference-endpoints`;
    console.log(`URL: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'Salad-Api-Key': saladApiKey,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error Response: ${errorText}`);
      return null;
    }
    
    const endpoints = await response.json();
    console.log('Salad Endpoints:', JSON.stringify(endpoints, null, 2));
    
    return endpoints;
  } catch (error) {
    console.error('Error checking Salad endpoints:', error.message);
    return null;
  }
}

async function main() {
  console.log('=== Direct Salad API Investigation ===');
  
  // Check Salad endpoints
  await checkSaladEndpoints();
  
  // List recent Salad jobs
  await listSaladJobs();
  
  // Check specific stuck jobs
  for (const job of stuckJobs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Checking stuck job: ${job.jobId}`);
    await checkSaladJobDirect(job.saladJobId);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('Investigation complete!');
}

main().catch(console.error);