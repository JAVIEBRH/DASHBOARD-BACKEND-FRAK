// api/estadias/[id].js
import { connectDb } from '../../lib/mongodb.js';
import Estadia from '../../lib/models/Estadia.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const { id } = req.query;
  await connectDb();

  if (req.method === 'PUT') {
    const result = await Estadia.findOneAndUpdate({ id }, req.body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await Estadia.deleteOne({ id });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
