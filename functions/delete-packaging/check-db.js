const { Client, Databases, Query } = require('node-appwrite');

const client = new Client()
  .setEndpoint('https://sgp.cloud.appwrite.io/v1')
  .setProject('694c240c0038e788d797')
  .setKey(process.env.APPWRITE_API_KEY);

const db = new Databases(client);
const RECORD_ID = '6957638e0005a29f36ae';
const DB_ID = '694c2463003b3254009c';

async function check() {
  console.log('API Key set:', !!process.env.APPWRITE_API_KEY);

  console.log('\n=== Checking packaging_records ===');
  try {
    const record = await db.getDocument(DB_ID, 'packaging_records', RECORD_ID);
    console.log('Record EXISTS:', record.waybill_number, record.packaging_date);
  } catch (e) {
    console.log('Record NOT FOUND:', e.code, e.message);
  }

  console.log('\n=== Checking audit_logs for this record ===');
  try {
    const logs = await db.listDocuments(DB_ID, 'audit_logs', [
      Query.equal('resource_id', RECORD_ID),
      Query.limit(10)
    ]);
    console.log('Found', logs.total, 'audit entries');
    logs.documents.forEach(log => {
      console.log(' -', log.action_type, 'at', log.timestamp);
      console.log('   by:', log.user_email);
      console.log('   details:', log.action_details);
    });
  } catch (e) {
    console.log('Error:', e.message);
  }

  console.log('\n=== Checking packaging_cache for stale data ===');
  try {
    const caches = await db.listDocuments(DB_ID, 'packaging_cache', [Query.limit(100)]);
    console.log('Found', caches.total, 'cache entries');
    let staleFound = false;
    for (const c of caches.documents) {
      try {
        const data = JSON.parse(c.data);
        const stale = data.find(r => r.$id === RECORD_ID);
        if (stale) {
          console.log('\n!!! STALE DATA FOUND !!!');
          console.log('  Cache date:', c.cache_date);
          console.log('  Cached at:', c.cached_at);
          console.log('  Waybill:', stale.waybill_number);
          staleFound = true;
        }
      } catch {}
    }
    if (!staleFound) console.log('No stale data found in cache');
  } catch (e) {
    console.log('Error:', e.message);
  }
}

check().catch(console.error);
