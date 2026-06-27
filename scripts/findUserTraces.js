import mongoose from 'mongoose';

const URI = process.env.MONGODB_URI || 'mongodb://mongo:DiGaBWUZXCkIxlZMuntztBaFJcOlUJIg@maglev.proxy.rlwy.net:40270/harx?authSource=admin';

const needles = [
  'elhoucineqara250620261',
  'elhoucineqarareps2306',
  'zdz89175',
  'nakbinakbi',
  'riksabiry',
  'mamour.kasse',
  'chafiksabiryadmin',
  '6a3c087a51f15e390804a4ad',
];

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  for (const name of (await db.listCollections().toArray()).map((c) => c.name).sort()) {
    for (const needle of needles) {
      const count = await db.collection(name).countDocuments({
        $or: [
          { email: new RegExp(needle, 'i') },
          { 'personalInfo.email': new RegExp(needle, 'i') },
          { fullName: new RegExp(needle, 'i') },
          { 'personalInfo.name': new RegExp(needle, 'i') },
        ],
      });
      if (count) console.log(`${name}: ${needle} -> ${count}`);
    }
  }
  await mongoose.disconnect();
}

main().catch(console.error);
