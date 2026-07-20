// scripts/mark-reusable-items-2026-07-20.js — run: node --env-file=.env scripts/mark-reusable-items-2026-07-20.js
// Marks sponges/cloths as reusable=true so pctEnUso (wear of the one
// currently in use) stops driving the "bajo stock" alert — only qtyBodega
// vs umbralUnidades should. Also sets umbralUnidades=2 for esponjas per
// Diego's example ("alerta cuando queden 2 en uso").
import mongoose from 'mongoose';
import StockItem from '../lib/models/StockItem.js';

const REUSABLE_NAME_PATTERN = /esponja|paño|paños/i;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  const items = await StockItem.find({ name: { $regex: REUSABLE_NAME_PATTERN } }).lean();
  console.log(`Found ${items.length} sponge/cloth items across all properties`);

  for (const i of items) {
    const isEsponja = /esponja/i.test(i.name);
    const set = { reusable: true };
    if (isEsponja) set.umbralUnidades = 2;
    await StockItem.updateOne({ id: i.id }, { $set: set });
    console.log(`Marked reusable=true${isEsponja ? ', umbral=2' : ''}: ${i.name} (${i.property})`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
