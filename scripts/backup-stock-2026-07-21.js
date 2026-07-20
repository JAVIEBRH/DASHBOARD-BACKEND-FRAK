// scripts/backup-stock-2026-07-21.js — run: node --env-file=.env scripts/backup-stock-2026-07-21.js
// Safety net before scripts/migrate-stock-en-uso-2026-07-21.js — Diego's
// colleague is actively editing stock data in production, so this dumps
// the exact live state immediately before any migration touches it.
import mongoose from 'mongoose';
import fs from 'fs';
import StockItem from '../lib/models/StockItem.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  const items = await StockItem.find({}).lean();
  const path = `./stock-backup-${Date.now()}.json`;
  fs.writeFileSync(path, JSON.stringify(items, null, 2));
  console.log(`Backed up ${items.length} StockItem documents to ${path}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
