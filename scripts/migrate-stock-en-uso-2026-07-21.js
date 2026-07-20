// scripts/migrate-stock-en-uso-2026-07-21.js — run: node --env-file=.env scripts/migrate-stock-en-uso-2026-07-21.js
// Prerequisite: scripts/backup-stock-2026-07-21.js must have been run first —
// this script does not re-check that, the operator running it must confirm.
//
// Reads StockItem fresh (not from any earlier session snapshot) so it
// correctly handles items Diego's colleague added/edited since this plan
// was written. Merge-pairs are matched by exact current name — if a pair
// was renamed or deleted since this plan was written, this script will
// simply not find it and will skip that merge (logged, not silently lost:
// the un-merged rows still individually migrate via the generic rule).
import mongoose from 'mongoose';
import StockItem from '../lib/models/StockItem.js';

// [bodega-row-name, en-uso-row-name, property] — these pairs were manually
// split into two StockItem rows earlier this session; the new model
// doesn't need two rows, so they merge back into one.
const MERGE_PAIRS = [
  ['lavaloza 1 litro', 'lavaloza cocina 480ml', 'pac'],
  ['limpiapisos diluido (bodega) 1 litro', 'limpiapisos diluido (en uso) 1 litro', 'pac'],
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  const allItems = await StockItem.find({}).lean();
  console.log(`Found ${allItems.length} StockItem documents (live, fresh read)`);

  const mergedIds = new Set();

  for (const [bodegaName, enUsoName, property] of MERGE_PAIRS) {
    const bodegaRow = allItems.find(i => i.name === bodegaName && i.property === property);
    const enUsoRow  = allItems.find(i => i.name === enUsoName && i.property === property);
    if (!bodegaRow || !enUsoRow) {
      console.warn(`SKIP merge pair (not found, migrating individually instead): "${bodegaName}" / "${enUsoName}"`);
      continue;
    }
    const mergedName = bodegaName.replace(/\(bodega\)\s*/i, '').trim();
    await StockItem.updateOne({ id: bodegaRow.id }, {
      $set: {
        name: mergedName,
        enUso: enUsoRow.pctEnUso != null ? [{ pct: enUsoRow.pctEnUso }] : [],
      },
    });
    await StockItem.deleteOne({ id: enUsoRow.id });
    mergedIds.add(bodegaRow.id);
    mergedIds.add(enUsoRow.id);
    console.log(`Merged "${bodegaName}" (kept, qtyBodega=${bodegaRow.qtyBodega}) + "${enUsoName}" (deleted, pct=${enUsoRow.pctEnUso}) -> "${mergedName}"`);
  }

  // Everything else: generic pctEnUso -> enUso conversion. `reusable` items
  // that had a real pct value keep it (informational, per the spec) —
  // enUso.length > 0 alone doesn't trigger the critical alert; only
  // qtyBodega === 0 AND a low pct together do (Task 3's stockStatus).
  const remaining = allItems.filter(i => !mergedIds.has(i.id));
  for (const item of remaining) {
    const enUso = item.pctEnUso != null ? [{ pct: item.pctEnUso }] : [];
    await StockItem.updateOne({ id: item.id }, { $set: { enUso } });
  }
  console.log(`Converted ${remaining.length} remaining items to the enUso array format`);

  const finalCount = await StockItem.countDocuments({});
  console.log(`Final StockItem count: ${finalCount} (started at ${allItems.length}, expect a drop of exactly ${mergedIds.size / 2} from merges)`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
