import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';
import dns from 'dns';

try {
  dns.setDefaultResultOrder?.('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch {}

function loadDotEnv() {
  const envRaw = readFileSync('.env', 'utf8');
  for (const line of envRaw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadDotEnv();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const client = new MongoClient(uri);

async function main() {
  await client.connect();
  const db = client.db('medsought');

  console.log('--- 1. Querying drug_aliases for lisinopril and spironolactone ---');
  const aliases = await db.collection('drug_aliases').find({
    alias: { $in: ['lisinopril', 'spironolactone'] }
  }).toArray();
  console.log('Aliases found:', JSON.stringify(aliases, null, 2));

  console.log('--- 2. Querying drug_interactions for pair_key lisinopril_spironolactone / spironolactone_lisinopril ---');
  const interactions = await db.collection('drug_interactions').find({
    pair_key: { $in: ['lisinopril_spironolactone', 'spironolactone_lisinopril'] }
  }).toArray();
  console.log('Direct pair_key query count:', interactions.length);
  console.log('Documents:', JSON.stringify(interactions, null, 2));

  console.log('--- 3. Querying drug_interactions by regex for any match ---');
  const regexMatches = await db.collection('drug_interactions').find({
    $or: [
      { drug_a_name: /lisinopril/i, drug_b_name: /spironolactone/i },
      { drug_a_name: /spironolactone/i, drug_b_name: /lisinopril/i }
    ]
  }).toArray();
  console.log('Regex match count:', regexMatches.length);
  console.log('Documents:', JSON.stringify(regexMatches, null, 2));

  console.log('--- 4. Querying DDInter interactions for all interactions involving Lisinopril ---');
  const lisinoprilCount = await db.collection('drug_interactions').countDocuments({
    $or: [{ drug_a_name: /lisinopril/i }, { drug_b_name: /lisinopril/i }]
  });
  console.log('Total DDInter interactions involving Lisinopril:', lisinoprilCount);

  console.log('--- 5. Querying DDInter interactions for all interactions involving Spironolactone ---');
  const spironolactoneCount = await db.collection('drug_interactions').countDocuments({
    $or: [{ drug_a_name: /spironolactone/i }, { drug_b_name: /spironolactone/i }]
  });
  console.log('Total DDInter interactions involving Spironolactone:', spironolactoneCount);

  await client.close();
}

main().catch(console.error);
