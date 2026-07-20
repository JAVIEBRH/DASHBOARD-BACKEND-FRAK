// scripts/migrate-dispensers-to-stock-2026-07-20.js — run: node --env-file=.env scripts/migrate-dispensers-to-stock-2026-07-20.js
// Dpto San Miguel: 6 bathroom dispensers (shampoo/jabonera) were loaded as
// FurnitureItem (fixed assets) instead of StockItem (consumables) — the
// "qty" field was actually being used to mean "% en uso", which only makes
// sense on a consumable. Migrates them to StockItem with pctEnUso = the
// value that was stored in qty, zone folded into the name since StockItem
// has no zone field (all consumables live in one property-wide bucket).
import mongoose from 'mongoose';
import FurnitureItem from '../lib/models/FurnitureItem.js';
import StockItem from '../lib/models/StockItem.js';

const ZONE_LABEL = { 'bano-matrimonial': 'Baño matrimonial', 'bano-2': 'Baño 2' };

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  const toMigrate = await FurnitureItem.find({
    property: 'dpto-san-miguel',
    zone: { $in: ['bano-matrimonial', 'bano-2'] },
    name: { $in: ['Shampoo 350ML', 'Shampoo 350 ML', 'Jabonera de ducha 350ML', 'Jabonera de lavamanos 150ML'] },
  }).lean();

  console.log(`Found ${toMigrate.length} furniture docs to migrate`);

  for (const f of toMigrate) {
    const cleanName = f.name.replace(/\s+ML/i, 'ML').replace(/(\d)ML$/, '$1ML'); // normalize "350 ML" -> "350ML"
    const newName = `${cleanName} (${ZONE_LABEL[f.zone]})`;
    await StockItem.create({
      id: `stock-sm-migrated-${f.id}`,
      property: 'dpto-san-miguel',
      category: 'ASEO',
      name: newName,
      unit: '',
      qtyBodega: 0,
      pctEnUso: f.qty,
      umbralUnidades: f.umbralUnidades ?? 1,
      source: 'manual',
    });
    console.log(`Created StockItem "${newName}" (pctEnUso=${f.qty})`);
    await FurnitureItem.deleteOne({ id: f.id });
    console.log(`Deleted FurnitureItem ${f.id}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
