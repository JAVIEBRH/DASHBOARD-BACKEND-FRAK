// scripts/seed-stock.js — run: node --env-file=.env scripts/seed-stock.js
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import StockItem from '../lib/models/StockItem.js';

const EXCEL_INVENTORY = 'C:\\Users\\Javier\\Downloads\\Inventario casa PAC.xlsx';

function normalize(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function namesMatch(a, b) {
  const na = normalize(a), nb = normalize(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function categoryFor(name) {
  if (/lavadora|ropa|suavizante/i.test(name)) return 'LAVANDERÍA';
  if (/lavaloza|cocina|antigrasa/i.test(name)) return 'COCINA';
  return 'ASEO';
}

function parseAseo(rows) {
  const items = [];
  for (let ri = 4; ri < rows.length; ri++) {
    const row = rows[ri];
    const name = row[3];
    if (typeof name !== 'string' || !name.trim()) continue;
    const qty = typeof row[2] === 'number' ? row[2] : 0;
    items.push({ name: name.trim(), qtyBodega: qty });
  }
  return items;
}

function parseEnUso(rows) {
  const items = [];
  for (let ri = 4; ri < rows.length; ri++) {
    const row = rows[ri];
    const name = row[12];
    if (typeof name !== 'string' || !name.trim()) continue;
    const raw = row[11];
    let pct = null;
    // "en uso" values are inconsistent in the source: 'full', a 0-1 fraction, or
    // occasionally an already-whole number (e.g. a unit count mistakenly entered here) —
    // treat anything already > 1 as a whole percentage rather than multiplying it.
    if (raw === 'full') pct = 100;
    else if (typeof raw === 'number') pct = Math.round(raw <= 1 ? raw * 100 : raw);
    if (pct === null) continue;
    items.push({ name: name.trim(), pctEnUso: pct });
  }
  return items;
}

function buildStockItems(rows) {
  const aseo = parseAseo(rows);
  const enUso = parseEnUso(rows);

  const items = aseo.map((a, i) => ({
    id: `stock-${i + 1}`,
    property: 'pac',
    category: categoryFor(a.name),
    name: a.name,
    unit: '',
    qtyBodega: a.qtyBodega,
    pctEnUso: null,
    umbralUnidades: 1,
    source: 'excel',
  }));

  let nextId = items.length + 1;
  for (const eu of enUso) {
    const match = items.find(it => namesMatch(it.name, eu.name));
    if (match) {
      match.pctEnUso = eu.pctEnUso;
    } else {
      items.push({
        id: `stock-${nextId++}`,
        property: 'pac',
        category: categoryFor(eu.name),
        name: eu.name,
        unit: '',
        qtyBodega: 0,
        pctEnUso: eu.pctEnUso,
        umbralUnidades: 1,
        source: 'excel',
      });
    }
  }

  return items;
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');
  const wb = XLSX.readFile(EXCEL_INVENTORY);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Hoja1'], { header: 1, defval: '' });
  const items = buildStockItems(rows);
  console.log(`Parsed ${items.length} stock items`);
  await StockItem.deleteMany({ source: 'excel' });
  await StockItem.insertMany(items);
  console.log(`Inserted ${items.length} stock items into Atlas`);
  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
