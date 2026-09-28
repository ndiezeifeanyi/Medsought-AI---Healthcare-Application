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

  const sample = await db.collection('drug_interactions').findOne({ level: 'Unknown' });
  console.log('Sample Unknown document fields:', Object.keys(sample || {}));
  console.log('Sample Unknown document:', JSON.stringify(sample, null, 2));

  // Find 10 pairs where level is Unknown and drug names are clean single words / well-known drugs
  const list = await db.collection('drug_interactions').find({
    level: 'Unknown'
  }).limit(20).toArray();

  console.log('\n--- 20 Unknown pairs ---');
  for (const doc of list) {
    console.log(JSON.stringify({
      id_a: doc.ddinter_id_a,
      drug_a: doc.drug_a,
      id_b: doc.ddinter_id_b,
      drug_b: doc.drug_b,
      level: doc.level,
      pair_key: doc.pair_key,
      atc: doc.atc_category
    }));
  }

  // Let's find common widely-known drugs with level Unknown
  const commonList = await db.collection('drug_interactions').find({
    level: 'Unknown',
    $or: [
      { drug_a: { $in: ['Metformin', 'Atorvastatin', 'Aspirin', 'Ibuprofen', 'Paracetamol', 'Omeprazole', 'Amoxicillin', 'Ciprofloxacin', 'Levothyroxine', 'Warfarin', 'Amlodipine'] } },
      { drug_b: { $in: ['Metformin', 'Atorvastatin', 'Aspirin', 'Ibuprofen', 'Paracetamol', 'Omeprazole', 'Amoxicillin', 'Ciprofloxacin', 'Levothyroxine', 'Warfarin', 'Amlodipine'] } }
    ]
  }).limit(20).toArray();

  console.log('\n--- Common Drugs with Unknown Severity ---');
  for (const doc of commonList) {
    console.log(JSON.stringify({
      id_a: doc.ddinter_id_a,
      drug_a: doc.drug_a,
      id_b: doc.ddinter_id_b,
      drug_b: doc.drug_b,
      level: doc.level,
      pair_key: doc.pair_key,
      atc: doc.atc_category
    }));
  }

  await client.close();
}

main().catch(console.error);
