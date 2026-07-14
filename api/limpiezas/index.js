// api/limpiezas/index.js
import { connectDb } from '../../lib/mongodb.js';
import Limpieza from '../../lib/models/Limpieza.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `limpieza-manual-${Date.now()}`;
    const item = await Limpieza.create({ ...data, id });
    return res.status(201).json({ ok: true, id: item.id });
  }

  res.status(405).end();
}
