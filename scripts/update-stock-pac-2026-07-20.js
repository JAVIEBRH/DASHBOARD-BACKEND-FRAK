// scripts/update-stock-pac-2026-07-20.js — run: node --env-file=.env scripts/update-stock-pac-2026-07-20.js
// One-time Casa PAC stock update from Diego's 2026-07-20 count, including
// merging duplicate items (esponja amarilla/morada) and splitting items that
// track two separate physical containers (lavaloza, limpiapisos diluido).
import mongoose from 'mongoose';
import StockItem from '../lib/models/StockItem.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  const updates = [
    { id: 'stock-2',  set: { qtyBodega: 2, pctEnUso: 40 } },   // shampoo 750 ml
    { id: 'stock-1',  set: { qtyBodega: 3, pctEnUso: 40 } },   // jabon 750
    { id: 'stock-21', set: { pctEnUso: 50 } },                  // quita manchas color 800 ml
    { id: 'stock-18', set: { pctEnUso: 20 } },                  // limpiavidrios 450 ml
    { id: 'stock-11', set: { qtyBodega: 2, pctEnUso: 40 } },   // lavaloza 1 litro (bodega + en uso)
    { id: 'stock-29', set: { name: 'lavaloza cocina 480ml', qtyBodega: 0, pctEnUso: 50 } }, // was "lavalosas 1 litro"
    { id: 'stock-34', set: { qtyBodega: 8, pctEnUso: null } }, // esponja amarilla (merged value)
    { id: 'stock-35', set: { qtyBodega: 3, pctEnUso: null } }, // esponja morada (merged value)
    { id: 'stock-19', set: { pctEnUso: null } },                // paños amarillos (false low-stock alert fix)
    { id: 'stock-17', set: { name: 'limpiapisos diluido (en uso) 1 litro', pctEnUso: 50 } },
  ];

  for (const u of updates) {
    const result = await StockItem.findOneAndUpdate({ id: u.id }, { $set: u.set });
    if (!result) console.warn(`WARNING: ${u.id} not found, skipped`);
    else console.log(`Updated ${u.id} (${result.name})`);
  }

  const toDelete = ['stock-3', 'stock-4']; // esponjas amarillas / moradas — merged into stock-34/stock-35
  const delResult = await StockItem.deleteMany({ id: { $in: toDelete } });
  console.log(`Deleted ${delResult.deletedCount} duplicate items:`, toDelete);

  const newItem = await StockItem.create({
    id: `stock-${Date.now()}`,
    property: 'pac',
    category: 'ASEO',
    name: 'limpiapisos diluido (bodega) 1 litro',
    unit: '',
    qtyBodega: 1,
    pctEnUso: 100,
    umbralUnidades: 0,
    source: 'manual',
  });
  console.log('Created new item:', newItem.id, newItem.name);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
