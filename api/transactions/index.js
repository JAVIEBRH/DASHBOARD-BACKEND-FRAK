// api/transactions/index.js
import { connectDb } from '../../lib/mongodb.js';
import Transaction from '../../lib/models/Transaction.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'GET') {
    const txs = await Transaction.find({ source: 'manual' }).lean();
    return res.json(txs);
  }

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `manual-${Date.now()}`;
    const tx = await Transaction.create({ ...data, id, source: 'manual' });
    return res.status(201).json({ ok: true, id: tx.id });
  }

  res.status(405).end();
}
