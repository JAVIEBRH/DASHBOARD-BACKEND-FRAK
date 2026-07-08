// scripts/seed-properties.js — run: node --env-file=.env scripts/seed-properties.js
// One-time setup: registers Casa PAC as the first property (with its 8 real room zones,
// matching the zone ids already used by scripts/seed-furniture.js) and backfills the
// `property` field on furniture rows created before that field existed.
import mongoose from 'mongoose';
import Property from '../lib/models/Property.js';
import FurnitureItem from '../lib/models/FurnitureItem.js';

const PAC_ZONES = [
  { id: 'living',       label: 'Living' },
  { id: 'comedor',      label: 'Comedor' },
  { id: 'cocina',       label: 'Cocina' },
  { id: 'baño',         label: 'Baño' },
  { id: 'lavanderia',   label: 'Lavandería' },
  { id: 'dormitorio1',  label: 'Dormitorio 1' },
  { id: 'dormitorio2',  label: 'Dormitorio 2' },
  { id: 'dormitorio3',  label: 'Dormitorio 3' },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  await Property.findOneAndUpdate(
    { id: 'pac' },
    { id: 'pac', name: 'Casa PAC', zones: PAC_ZONES, source: 'seed' },
    { upsert: true }
  );
  console.log('Upserted property: pac (8 zones)');

  const result = await FurnitureItem.updateMany({ property: { $exists: false } }, { $set: { property: 'pac' } });
  console.log(`Backfilled property='pac' on ${result.modifiedCount} furniture items`);

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
