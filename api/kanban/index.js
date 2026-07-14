// api/kanban/index.js
import { connectDb } from '../../lib/mongodb.js';
import KanbanTask from '../../lib/models/KanbanTask.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `kanban-manual-${Date.now()}`;
    const item = await KanbanTask.create({ ...data, id });
    return res.status(201).json({ ok: true, id: item.id });
  }

  res.status(405).end();
}
