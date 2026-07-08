// api/stock/index.js
import { connectDb } from '../../lib/mongodb.js';
import StockItem from '../../lib/models/StockItem.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `stock-manual-${Date.now()}`;
    const item = await StockItem.create({ ...data, id, source: 'manual' });
    return res.status(201).json({ ok: true, id: item.id });
  }

  res.status(405).end();
}
