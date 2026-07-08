// scripts/seed-furniture.js — run: node --env-file=.env scripts/seed-furniture.js
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import FurnitureItem from '../lib/models/FurnitureItem.js';

const EXCEL_INVENTORY = 'C:\\Users\\Javier\\Downloads\\Inventario casa PAC.xlsx';

const ZONE_SHEETS = {
  'LIVING': 'living',
  'COMEDOR': 'comedor',
  'COCINA': 'cocina',
  'BAÑO': 'baño',
  'LAVANDERÍA': 'lavanderia',
  'DORMITORIO 1': 'dormitorio1',
  'DORMITORIO 2': 'dormitorio2',
  'DORMITORIO 3': 'dormitorio3',
};

function categoryFor(name) {
  if (/sofá|silla|mesa|cama|velador/i.test(name)) return 'Muebles';
  if (/lámpara|ampolleta/i.test(name))            return 'Iluminación';
  return 'Equipo';
}

function extractPairs(rows) {
  const pairs = [];
  for (let ri = 3; ri < rows.length; ri++) {
    const row = rows[ri];
    for (let ci = 0; ci < row.length - 1; ci++) {
      const qty = row[ci];
      const name = row[ci + 1];
      if (typeof qty === 'number' && qty > 0 && typeof name === 'string' && name.trim()) {
        pairs.push({ qty, name: name.trim() });
      }
    }
  }
  return pairs;
}

function parseRoomSheet(wb, sheetName, zone, startId) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  return extractPairs(rows).map((p, i) => ({
    id: `furniture-${startId + i}`,
    zone,
    category: categoryFor(p.name),
    name: p.name,
    qty: p.qty,
    umbralUnidades: 1,
    source: 'excel',
  }));
}

function parseReposicion(wb, startId) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, defval: '' });
  const items = [];
  for (let ri = 4; ri < rows.length; ri++) {
    const row = rows[ri];
    const qty = row[7];
    const name = row[8];
    if (typeof qty !== 'number' || qty <= 0 || typeof name !== 'string' || !name.trim()) continue;
    const isLaundry = /colgador|filtro/i.test(name);
    items.push({
      id: `furniture-${startId + items.length}`,
      zone: isLaundry ? 'lavanderia' : 'cocina',
      category: isLaundry ? 'Equipo' : 'Vajilla',
      name: name.trim(),
      qty,
      umbralUnidades: 1,
      source: 'excel',
    });
  }
  return items;
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');
  const wb = XLSX.readFile(EXCEL_INVENTORY);

  let items = [];
  for (const [sheetName, zone] of Object.entries(ZONE_SHEETS)) {
    items = items.concat(parseRoomSheet(wb, sheetName, zone, items.length + 1));
  }
  items = items.concat(parseReposicion(wb, items.length + 1));

  console.log(`Parsed ${items.length} furniture items`);
  await FurnitureItem.deleteMany({ source: 'excel' });
  await FurnitureItem.insertMany(items);
  console.log(`Inserted ${items.length} furniture items into Atlas`);
  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
