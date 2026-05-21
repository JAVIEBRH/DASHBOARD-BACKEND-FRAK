// api/data.js
import { connectDb } from '../lib/mongodb.js';
import Transaction from '../lib/models/Transaction.js';
import { buildDiegoData } from '../lib/buildDiegoData.js';
import { handleCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  await connectDb();
  const txs = await Transaction.find({}).lean();
  res.json(buildDiegoData(txs));
}
