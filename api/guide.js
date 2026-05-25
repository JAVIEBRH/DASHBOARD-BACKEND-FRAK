import { connectDb } from '../lib/mongodb.js';
import GuideConfig from '../lib/models/GuideConfig.js';
import { handleCors } from '../lib/cors.js';

const PW = process.env.GUIDE_PASSWORD ?? 'casapac';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'GET') {
    const cfg = await GuideConfig.findOne({ key: 'main' }).lean();
    return res.json(cfg?.data ?? {});
  }

  if (req.method === 'PUT') {
    const { password, ...fields } = req.body ?? {};
    if (password !== PW) return res.status(401).json({ ok: false, error: 'unauthorized' });
    await GuideConfig.findOneAndUpdate(
      { key: 'main' },
      { $set: { data: fields } },
      { upsert: true }
    );
    return res.json({ ok: true });
  }

  res.status(405).end();
}
