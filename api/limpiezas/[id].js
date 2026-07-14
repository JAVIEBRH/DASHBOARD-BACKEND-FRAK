// api/limpiezas/[id].js
import { connectDb } from '../../lib/mongodb.js';
import Limpieza from '../../lib/models/Limpieza.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const { id } = req.query;
  await connectDb();

  if (req.method === 'PUT') {
    const result = await Limpieza.findOneAndUpdate({ id }, req.body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await Limpieza.deleteOne({ id });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
