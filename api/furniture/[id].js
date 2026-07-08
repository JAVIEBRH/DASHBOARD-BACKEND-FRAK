// api/furniture/[id].js
import { connectDb } from '../../lib/mongodb.js';
import FurnitureItem from '../../lib/models/FurnitureItem.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const { id } = req.query;
  await connectDb();

  if (req.method === 'PUT') {
    const result = await FurnitureItem.findOneAndUpdate({ id }, req.body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await FurnitureItem.deleteOne({ id });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
