// api/estadias/index.js
import { connectDb } from '../../lib/mongodb.js';
import Estadia from '../../lib/models/Estadia.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `estadia-manual-${Date.now()}`;
    const item = await Estadia.create({ ...data, id });
    return res.status(201).json({ ok: true, id: item.id });
  }

  res.status(405).end();
}
