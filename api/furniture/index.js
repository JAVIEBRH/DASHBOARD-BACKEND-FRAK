// api/furniture/index.js
import { connectDb } from '../../lib/mongodb.js';
import FurnitureItem from '../../lib/models/FurnitureItem.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `furniture-manual-${Date.now()}`;
    const item = await FurnitureItem.create({ ...data, id, source: 'manual' });
    return res.status(201).json({ ok: true, id: item.id });
  }

  res.status(405).end();
}
