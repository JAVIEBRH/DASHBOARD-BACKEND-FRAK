// api/properties/index.js
import { connectDb } from '../../lib/mongodb.js';
import Property from '../../lib/models/Property.js';
import { handleCors } from '../../lib/cors.js';

function slugify(s) {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'GET') {
    const properties = await Property.find({}).lean();
    return res.json(properties);
  }

  if (req.method === 'POST') {
    const { name, zones } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ ok: false, error: 'name is required' });
    if (!Array.isArray(zones) || zones.length === 0) return res.status(400).json({ ok: false, error: 'at least one zone is required' });

    const id = slugify(name);
    const existing = await Property.findOne({ id });
    if (existing) return res.status(409).json({ ok: false, error: 'a property with this name already exists' });

    const zoneDocs = zones
      .map(label => (label ?? '').trim())
      .filter(Boolean)
      .map(label => ({ id: slugify(label), label }));

    const property = await Property.create({ id, name: name.trim(), zones: zoneDocs, source: 'manual' });
    return res.status(201).json({ ok: true, id: property.id });
  }

  res.status(405).end();
}
