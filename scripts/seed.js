// scripts/seed.js — run: node --env-file=.env scripts/seed.js
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import XLSX from 'xlsx';
import mongoose from 'mongoose';
import Transaction from '../lib/models/Transaction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_2025 = path.join(__dirname, '../../../../AIRBNB DIEGO  ALLENDES/Planilla Contable 2025.xlsx');
const EXCEL_2026 = path.join(__dirname, '../../../../AIRBNB DIEGO  ALLENDES/Planilla Contable 2026.xlsx');

const COL_MAP_19 = [
  null, null,
  { cat: 'AIRBNB',         bucket: 'income'       },
  { cat: 'COMISIONES',     bucket: 'income'       },
  { cat: 'ARTESANIAS',     bucket: 'income'       },
  { cat: 'INTERESES',      bucket: 'auto'         },
  { cat: 'APORTE_SOCIOS',  bucket: 'income'       },
  { cat: 'PROPIETARIOS',   bucket: 'expense_op'   },
  { cat: 'ARTESANIAS',     bucket: 'expense_op'   },
  { cat: 'IMPUESTOS',      bucket: 'expense_op'   },
  { cat: 'COMUNICACIONES', bucket: 'expense_op'   },
  { cat: 'CONTABILIDAD',   bucket: 'expense_op'   },
  { cat: 'RETIROS',        bucket: 'retiro_socio' },
  { cat: 'LIMPIEZA',       bucket: 'expense_op'   },
  { cat: 'INSUMOS',        bucket: 'expense_op'   },
  { cat: 'EQUIPAMIENTO',   bucket: 'expense_op'   },
  { cat: 'PUBLICIDAD',     bucket: 'expense_op'   },
  null, null,
];

const COL_MAP_20 = [
  null, null,
  { cat: 'AIRBNB',         bucket: 'income'       },
  { cat: 'COMISIONES',     bucket: 'income'       },
  { cat: 'ARTESANIAS',     bucket: 'income'       },
  { cat: 'INTERESES',      bucket: 'auto'         },
  { cat: 'APORTE_SOCIOS',  bucket: 'income'       },
  { cat: 'PROPIETARIOS',   bucket: 'expense_op'   },
  { cat: 'ARTESANIAS',     bucket: 'expense_op'   },
  { cat: 'TRANSPORTES',    bucket: 'expense_op'   },
  { cat: 'IMPUESTOS',      bucket: 'expense_op'   },
  { cat: 'COMUNICACIONES', bucket: 'expense_op'   },
  { cat: 'CONTABILIDAD',   bucket: 'expense_op'   },
  { cat: 'RETIROS',        bucket: 'retiro_socio' },
  { cat: 'LIMPIEZA',       bucket: 'expense_op'   },
  { cat: 'INSUMOS',        bucket: 'expense_op'   },
  { cat: 'EQUIPAMIENTO',   bucket: 'expense_op'   },
  { cat: 'PUBLICIDAD',     bucket: 'expense_op'   },
  null, null,
];

function getProperty(c) {
  if (!c) return 'unassigned';
  if (/\bPAC\b/i.test(c)) return 'pac';
  if (/coyhaique/i.test(c)) return 'coyhaique';
  if (/\bdepto\b|departamento/i.test(c)) return 'depto';
  return 'unassigned';
}

function overrideBucket(c, b) {
  return /remesa.*(jat|propietario)/i.test(c) ? 'retiro_socio' : b;
}

function formatDate(d) {
  if (!d || !(d instanceof Date)) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function parseFile(filePath, yearSuffix) {
  if (!fs.existsSync(filePath)) { console.warn('Not found:', filePath); return []; }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const txs = []; let txId = 1;
  for (const sheetName of wb.SheetNames) {
    const monthCode = sheetName.trim();
    if (!monthCode.endsWith(yearSuffix)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: null });
    if (rows.length < 5) continue;
    const headerRow = (rows[2] || []).map(h => (h || '').toString().toUpperCase().trim());
    const colMap = headerRow.includes('TRANSPORTES') ? COL_MAP_20 : COL_MAP_19;
    for (let ri = 4; ri < rows.length; ri++) {
      const row = rows[ri];
      if (!row) continue;
      if (!row.slice(2).some(v => v !== null && v !== undefined && v !== 0 && v !== '')) continue;
      const concepto = row[1];
      if (!concepto || typeof concepto !== 'string' || !concepto.trim()) continue;
      const cu = concepto.toString().trim().toUpperCase();
      if (cu.startsWith('TOTAL') || cu.startsWith('SALDO')) continue;
      for (let ci = 2; ci < Math.min(colMap.length, row.length); ci++) {
        const mapping = colMap[ci];
        if (!mapping) continue;
        const value = row[ci];
        if (value === null || value === undefined || value === '' || value === 0) continue;
        const amt = typeof value === 'number' ? value : parseFloat(value);
        if (isNaN(amt) || amt === 0) continue;
        let bucket = mapping.bucket;
        if (bucket === 'auto') bucket = amt > 0 ? 'income' : 'expense_op';
        bucket = overrideBucket(concepto, bucket);
        txs.push({
          id: `t${txId++}`, date: formatDate(row[0]), month: monthCode,
          concepto: concepto.trim(), property: getProperty(concepto),
          type: amt > 0 ? 'income' : 'expense', category: mapping.cat,
          bucket, amount: Math.round(amt), source: 'excel',
        });
      }
    }
  }
  return txs;
}

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');
  const all = [
    ...parseFile(EXCEL_2025, '-25'),
    ...parseFile(EXCEL_2026, '-26'),
  ].map((t, i) => ({ ...t, id: `t${i + 1}` }));
  console.log(`Parsed ${all.length} transactions`);
  await Transaction.deleteMany({ source: 'excel' });
  await Transaction.insertMany(all);
  console.log(`Inserted ${all.length} transactions into Atlas`);
  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(err => { console.error(err); process.exit(1); });
