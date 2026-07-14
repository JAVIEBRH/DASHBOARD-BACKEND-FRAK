// api/airbnb.js
// Consolidated CRUD for estadias, limpiezas and kanban tasks — kept as a
// single serverless function (Vercel Hobby plan caps deployments at 12
// functions, and plain @vercel/node functions don't support Next.js-style
// [...catchall] routing). Resource and id are passed as query params:
// POST/PUT/DELETE /api/airbnb?resource=<estadias|limpiezas|kanban>&id=<id>
import { connectDb } from '../lib/mongodb.js';
import Estadia from '../lib/models/Estadia.js';
import Limpieza from '../lib/models/Limpieza.js';
import KanbanTask from '../lib/models/KanbanTask.js';
import { handleCors } from '../lib/cors.js';

const MODELS = { estadias: Estadia, limpiezas: Limpieza, kanban: KanbanTask };
const ID_PREFIX = { estadias: 'estadia', limpiezas: 'limpieza', kanban: 'kanban' };

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const { resource, id } = req.query;
  const Model = MODELS[resource];
  if (!Model) return res.status(404).json({ ok: false, error: 'unknown resource' });
  await connectDb();

  if (req.method === 'POST' && !id) {
    const data = req.body;
    const newId = data.id || `${ID_PREFIX[resource]}-manual-${Date.now()}`;
    const item = await Model.create({ ...data, id: newId });
    return res.status(201).json({ ok: true, id: item.id });
  }

  if (req.method === 'PUT' && id) {
    const result = await Model.findOneAndUpdate({ id }, req.body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE' && id) {
    await Model.deleteOne({ id });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
