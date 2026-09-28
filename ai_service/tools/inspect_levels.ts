import dns from "node:dns";
import { MongoClient } from "mongodb";

try {
  dns.setDefaultResultOrder?.("ipv4first");
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Missing MONGODB_URI");

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DATABASE || "medsought");
  const col = db.collection(process.env.DDINTER_COLLECTION || "drug_interactions");

  const distinctLevels = await col.distinct("level");
  console.log("Distinct level values:", distinctLevels);

  const pipeline = [
    { $group: { _id: "$level", count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ];
  const aggregation = await col.aggregate(pipeline).toArray();
  console.log("Aggregation results:");
  console.table(aggregation);

  const total = await col.estimatedDocumentCount();
  console.log("Total estimated document count:", total);

  // Sample some docs from each level
  for (const lvl of distinctLevels) {
    const sample = await col.find({ level: lvl }).limit(3).toArray();
    console.log(`\nSample docs for level="${lvl}":`);
    for (const doc of sample) {
      console.log(`  - ${doc.drug_a} + ${doc.drug_b} (IDs: ${doc.ddinter_id_a} + ${doc.ddinter_id_b}, ATC: ${doc.atc_codes.join(",")})`);
    }
  }

  await client.close();
}

run().catch(console.error);
