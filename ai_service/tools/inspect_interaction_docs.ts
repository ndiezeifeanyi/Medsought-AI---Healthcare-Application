import dns from "node:dns";
import { MongoClient } from "mongodb";

try {
  dns.setDefaultResultOrder?.("ipv4first");
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch {}

async function main() {
  const client = new MongoClient(process.env.MONGODB_URI!);
  await client.connect();
  const db = client.db(process.env.MONGODB_DATABASE || "medsought");
  const col = db.collection("drug_interactions");

  console.log("=== SAMPLE DOCUMENTS FROM drug_interactions COLLECTION ===");
  const samples = await col.find({}).limit(5).toArray();
  for (const s of samples) {
    console.log(JSON.stringify(s, null, 2));
    console.log(`- doc.mechanism is undefined: ${s.mechanism === undefined}`);
    console.log(`- doc.management is undefined: ${s.management === undefined}`);
  }

  const totalCount = await col.countDocuments();
  const hasMechanismCount = await col.countDocuments({ mechanism: { $exists: true, $ne: null } });
  const hasManagementCount = await col.countDocuments({ management: { $exists: true, $ne: null } });

  console.log("\n=== DOCUMENT FIELD SUMMARY ===");
  console.log(`- Total documents in collection:   ${totalCount}`);
  console.log(`- Documents with 'mechanism' field: ${hasMechanismCount}`);
  console.log(`- Documents with 'management' field: ${hasManagementCount}`);

  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
