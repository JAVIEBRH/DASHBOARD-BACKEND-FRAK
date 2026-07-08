# Módulo Stock (consumibles + activos fijos por zona) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full CRUD inventory module ("Stock") for the Send Austral dashboard: consumibles (StockItem) with the existing alert/badge system, plus activos fijos (FurnitureItem) organized by zone of the house, sharing one overview + detail UI.

**Architecture:** Two independent Mongoose collections (`StockItem`, `FurnitureItem`) exposed read-only via the existing bundled `GET /api/data` payload and mutated via dedicated REST endpoints (`/api/stock`, `/api/furniture`), mirroring the existing `Transaction` CRUD pattern exactly. Frontend: one `Stock` view with two sub-screens (zone overview grid, per-zone CRUD table) sharing a generic table component and modal, wired into the existing `App.jsx` view-router and `useTransactions`-owned `data`/`setData` state.

**Tech Stack:** Node.js (Vercel serverless functions) + Mongoose + MongoDB Atlas (backend, `DASHBOARD-BACKEND-FRAK`); React 19 + Vite, no state library beyond hooks (frontend, `DASHBOARD-FRONTEND-FRAK`).

## Global Constraints

- Spec: `DASHBOARD-BACKEND-FRAK/docs/superpowers/specs/2026-07-07-stock-module-design.md` — every field name, model shape, and scope boundary below comes from that file; do not deviate without updating the spec first.
- No test framework exists in either repo (confirmed: no jest/vitest/mocha in either `package.json`). Follow the existing convention: verify backend changes by running scripts/curl against a real Atlas connection, verify frontend changes by running `npm run dev` and checking the browser. Do not introduce a test framework as part of this plan.
- Follow existing file conventions exactly: backend CRUD endpoints mirror `api/transactions/index.js` and `api/transactions/[id].js` byte-for-byte in structure; frontend hooks mirror `src/hooks/useTransactions.js`'s optimistic-update pattern; seed scripts mirror `scripts/seed.js`'s structure (direct `mongoose.connect`, hardcoded absolute source path, `source: 'excel'` + `deleteMany`/`insertMany` idempotent replace).
- Source data: `C:\Users\Javier\Downloads\Inventario casa PAC.xlsx` — sheet names and column layout have been verified against the real file (see Task 6 and 7); do not re-guess column positions.
- CSS: reuse existing classes (`v-card`, `v-section-head`, `v-eyebrow`, `v-section-title`, `v-input`, `v-select`, `v-btn`, `v-btn.ghost`, `v-btn.primary`, `v-empty`, `v-modal-backdrop`, `v-modal`, `v-modal-head`, `v-modal-eyebrow`, `v-modal-title`, `v-modal-close`, `v-modal-foot`, `v-form-row`, `v-form-row-split`, `v-form-label`, `v-form-error`, `v-input-error`) and inline styles for one-off layout, exactly like `Transactions.jsx` and `Modal.jsx` already do. Do not add new global CSS classes.
- Design tokens available (from `src/index.css` `:root`): `--signal-pos` (green), `--signal-neg` (red), `--jat` (amber, `#D97706`), `--ink`, `--ink-2`, `--ink-3`, `--line`, `--surface`, `--font-mono`, `--font-serif`.

---

## Backend — `DASHBOARD-BACKEND-FRAK`

### Task 1: `StockItem` Mongoose model

**Files:**
- Create: `lib/models/StockItem.js`

**Interfaces:**
- Produces: default-exported Mongoose model `StockItem` with fields `id, property, category, name, unit, qtyBodega, pctEnUso, umbralUnidades, source`. Consumed by Tasks 3, 5, 6.

- [ ] **Step 1: Write the model**

```js
// lib/models/StockItem.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  property:       String,
  category:       String,
  name:           String,
  unit:           String,
  qtyBodega:      Number,
  pctEnUso:       { type: Number, default: null },
  umbralUnidades: { type: Number, default: 1 },
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});

export default mongoose.models.StockItem
  ?? mongoose.model('StockItem', schema);
```

- [ ] **Step 2: Verify it loads without error**

Run: `node -e "import('./lib/models/StockItem.js').then(m => console.log(typeof m.default))"`
Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add lib/models/StockItem.js
git commit -m "feat: add StockItem model"
```

---

### Task 2: `FurnitureItem` Mongoose model

**Files:**
- Create: `lib/models/FurnitureItem.js`

**Interfaces:**
- Produces: default-exported Mongoose model `FurnitureItem` with fields `id, zone, category, name, qty, umbralUnidades, source`. Consumed by Tasks 4, 5, 7.

- [ ] **Step 1: Write the model**

```js
// lib/models/FurnitureItem.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  zone:           { type: String, required: true },
  category:       String,
  name:           String,
  qty:            Number,
  umbralUnidades: { type: Number, default: 1 },
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});

export default mongoose.models.FurnitureItem
  ?? mongoose.model('FurnitureItem', schema);
```

- [ ] **Step 2: Verify it loads without error**

Run: `node -e "import('./lib/models/FurnitureItem.js').then(m => console.log(typeof m.default))"`
Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add lib/models/FurnitureItem.js
git commit -m "feat: add FurnitureItem model"
```

---

### Task 3: `api/stock` CRUD endpoints

**Files:**
- Create: `api/stock/index.js`
- Create: `api/stock/[id].js`

**Interfaces:**
- Consumes: `StockItem` model from Task 1 (`export default` from `lib/models/StockItem.js`), `handleCors` from `lib/cors.js`, `connectDb` from `lib/mongodb.js` (both existing, unchanged).
- Produces: `POST /api/stock` (body: StockItem fields minus `id`/`source` → `{ ok: true, id }`), `PUT /api/stock/:id`, `DELETE /api/stock/:id` (both → `{ ok: true }`). Consumed by Task 12 (`api.js`).

- [ ] **Step 1: Write the collection endpoint**

```js
// api/stock/index.js
import { connectDb } from '../../lib/mongodb.js';
import StockItem from '../../lib/models/StockItem.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `stock-manual-${Date.now()}`;
    const item = await StockItem.create({ ...data, id, source: 'manual' });
    return res.status(201).json({ ok: true, id: item.id });
  }

  res.status(405).end();
}
```

- [ ] **Step 2: Write the item endpoint**

```js
// api/stock/[id].js
import { connectDb } from '../../lib/mongodb.js';
import StockItem from '../../lib/models/StockItem.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const { id } = req.query;
  await connectDb();

  if (req.method === 'PUT') {
    const result = await StockItem.findOneAndUpdate({ id }, req.body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await StockItem.deleteOne({ id });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
```

- [ ] **Step 3: Verify locally against Atlas**

Run: `vercel dev` (or `node -e` smoke test below) in one terminal, then in another:
```bash
curl -X POST http://localhost:3000/api/stock -H "Content-Type: application/json" -d "{\"property\":\"pac\",\"category\":\"ASEO\",\"name\":\"test item\",\"unit\":\"\",\"qtyBodega\":5,\"umbralUnidades\":1}"
```
Expected: `{"ok":true,"id":"stock-manual-<timestamp>"}`. Then `curl -X DELETE http://localhost:3000/api/stock/<id-from-response>` and expect `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add api/stock/index.js "api/stock/[id].js"
git commit -m "feat: add stock CRUD endpoints"
```

---

### Task 4: `api/furniture` CRUD endpoints

**Files:**
- Create: `api/furniture/index.js`
- Create: `api/furniture/[id].js`

**Interfaces:**
- Consumes: `FurnitureItem` model from Task 2.
- Produces: `POST /api/furniture`, `PUT /api/furniture/:id`, `DELETE /api/furniture/:id` — identical response shapes to Task 3. Consumed by Task 12.

- [ ] **Step 1: Write the collection endpoint**

```js
// api/furniture/index.js
import { connectDb } from '../../lib/mongodb.js';
import FurnitureItem from '../../lib/models/FurnitureItem.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await connectDb();

  if (req.method === 'POST') {
    const data = req.body;
    const id = data.id || `furniture-manual-${Date.now()}`;
    const item = await FurnitureItem.create({ ...data, id, source: 'manual' });
    return res.status(201).json({ ok: true, id: item.id });
  }

  res.status(405).end();
}
```

- [ ] **Step 2: Write the item endpoint**

```js
// api/furniture/[id].js
import { connectDb } from '../../lib/mongodb.js';
import FurnitureItem from '../../lib/models/FurnitureItem.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const { id } = req.query;
  await connectDb();

  if (req.method === 'PUT') {
    const result = await FurnitureItem.findOneAndUpdate({ id }, req.body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    await FurnitureItem.deleteOne({ id });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
```

- [ ] **Step 3: Verify locally against Atlas**

With `vercel dev` running:
```bash
curl -X POST http://localhost:3000/api/furniture -H "Content-Type: application/json" -d "{\"zone\":\"living\",\"category\":\"Muebles\",\"name\":\"test sofa\",\"qty\":2,\"umbralUnidades\":1}"
```
Expected: `{"ok":true,"id":"furniture-manual-<timestamp>"}`. Then `curl -X DELETE http://localhost:3000/api/furniture/<id>` and expect `{"ok":true}`.

- [ ] **Step 4: Commit**

```bash
git add api/furniture/index.js "api/furniture/[id].js"
git commit -m "feat: add furniture CRUD endpoints"
```

---

### Task 5: Bundle `stock` and `furniture` into `GET /api/data`

**Files:**
- Modify: `lib/buildDiegoData.js`
- Modify: `api/data.js`

**Interfaces:**
- Consumes: `StockItem`, `FurnitureItem` models (Tasks 1, 2).
- Produces: `data.stock` (array of `{id, property, category, name, unit, qtyBodega, pctEnUso, umbralUnidades}`) and `data.furniture` (array of `{id, zone, category, name, qty, umbralUnidades}`) on the `GET /api/data` payload. Consumed by Task 12 (`useTransactions`), Task 13/14 (hooks), Task 17 (`Stock.jsx`).

- [ ] **Step 1: Modify `buildDiegoData` to accept and map stock/furniture**

In `lib/buildDiegoData.js`, change the function signature and add the two new fields to the returned object:

```js
export function buildDiegoData(transactions, stockItems = [], furnitureItems = []) {
```

Add inside the returned object (after the `transactions:` field, before `buckets:`):

```js
    stock: stockItems.map(s => ({
      id: s.id, property: s.property, category: s.category, name: s.name,
      unit: s.unit, qtyBodega: s.qtyBodega, pctEnUso: s.pctEnUso, umbralUnidades: s.umbralUnidades,
    })),
    furniture: furnitureItems.map(f => ({
      id: f.id, zone: f.zone, category: f.category, name: f.name,
      qty: f.qty, umbralUnidades: f.umbralUnidades,
    })),
```

- [ ] **Step 2: Modify `api/data.js` to query both collections**

```js
// api/data.js
import { connectDb } from '../lib/mongodb.js';
import Transaction from '../lib/models/Transaction.js';
import StockItem from '../lib/models/StockItem.js';
import FurnitureItem from '../lib/models/FurnitureItem.js';
import { buildDiegoData } from '../lib/buildDiegoData.js';
import { handleCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  await connectDb();
  const txs = await Transaction.find({}).lean();
  const stock = await StockItem.find({}).lean();
  const furniture = await FurnitureItem.find({}).lean();
  res.json(buildDiegoData(txs, stock, furniture));
}
```

- [ ] **Step 3: Verify**

With `vercel dev` running: `curl http://localhost:3000/api/data | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('stock:', d.stock.length, 'furniture:', d.furniture.length)"`
Expected: `stock: 0 furniture: 0` (both collections are empty until Tasks 6/7 seed them — confirms the fields exist and don't crash the endpoint).

- [ ] **Step 4: Commit**

```bash
git add lib/buildDiegoData.js api/data.js
git commit -m "feat: bundle stock and furniture into GET /api/data"
```

---

### Task 6: `scripts/seed-stock.js` — parse consumibles from Excel

**Files:**
- Create: `scripts/seed-stock.js`

**Interfaces:**
- Consumes: `StockItem` model (Task 1).
- Produces: populates the `stockitems` Atlas collection with `source: 'excel'` documents. No other task depends on this script's internals, only on its side effect (DB rows).

**Context:** The source file `C:\Users\Javier\Downloads\Inventario casa PAC.xlsx`, sheet `Hoja1`, has been inspected directly (row/column layout below is verified against the real file, not guessed):
- Row 0-3: headers (`INVENTARIO STOCK`, blank, blank, section labels). Data starts at row index 4.
- Cols 2/3 (`C`/`D`): "Implementos de aseo" — qty (number, can be `0`), name.
- Cols 7/8 (`H`/`I`): "Reposición de artículos" — **not used here**, consumed by Task 7 instead (activos fijos, out of scope for `StockItem`).
- Cols 11/12 (`L`/`M`, 0-indexed 11/12 — verified by direct inspection, not columns K/L as a first guess assumed): "En uso/Estado" — value (`'full'` string, or a decimal number where `<=1` means a fraction like `0.2` = 20%, otherwise already a whole-number percentage), name. Rows with an empty value (name present, value blank) are skipped — no reading to record.
- "En uso" items are matched against already-parsed aseo items by normalized name equality or substring containment; on match, `pctEnUso` is filled onto the existing item. On no match, a new `StockItem` is created with `qtyBodega: 0`.
- This produces 38 `StockItem` records when run against the real file (verified by dry run).

- [ ] **Step 1: Write the seed script**

```js
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
```

- [ ] **Step 2: Run it and verify the count**

Run: `node --env-file=.env scripts/seed-stock.js`
Expected output ends with:
```
Parsed 38 stock items
Inserted 38 stock items into Atlas
Done.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-stock.js
git commit -m "feat: add stock seed script"
```

---

### Task 7: `scripts/seed-furniture.js` — parse activos fijos from Excel

**Files:**
- Create: `scripts/seed-furniture.js`

**Interfaces:**
- Consumes: `FurnitureItem` model (Task 2).
- Produces: populates the `furnitureitems` Atlas collection with `source: 'excel'` documents.

**Context:** The 8 room sheets (`LIVING`, `COMEDOR`, `COCINA`, `BAÑO`, `LAVANDERÍA`, `DORMITORIO 1`, `DORMITORIO 2`, `DORMITORIO 3`) do **not** use fixed columns — each row can contain multiple `qty, name` pairs at different column offsets (verified: e.g. `COCINA` row 3 is `[1,"REFRIGERADOR MADEMSA",1,"CUBETERA PARA HIELOS","","","","",1,"MUEBLE LAVAPLATOS",1,"SECADOR DE LOZA Y SERVICIOS"]` — four pairs in one row at offsets 0, 2, 8, 10). The correct parse is a generic left-to-right scan: any cell that is a positive number immediately followed by a non-empty string cell is one item. Rows 0-2 of each sheet are headers (title, blank, zone name); data scan starts at row index 3. This produces 225 items across the 8 room sheets, verified by dry run.

The "Reposición de artículos" list (`Hoja1`, cols 7/8, fixed columns) is also in scope here (per approved spec) — 18 items, assigned to zone `cocina`/category `Vajilla` by default, except two that are genuinely laundry-related (`colgadores de ropa`, `filtros lavadora` — verified present in the real sheet) which are assigned to zone `lavanderia`/category `Equipo`. Total: 243 `FurnitureItem` records, verified by dry run.

- [ ] **Step 1: Write the seed script**

```js
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
```

- [ ] **Step 2: Run it and verify the count**

Run: `node --env-file=.env scripts/seed-furniture.js`
Expected output ends with:
```
Parsed 243 furniture items
Inserted 243 furniture items into Atlas
Done.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/seed-furniture.js
git commit -m "feat: add furniture seed script"
```

---

### Task 8: End-to-end backend verification

**Files:** none (verification-only task)

- [ ] **Step 1: Confirm `GET /api/data` now returns real data**

With `vercel dev` running: `curl http://localhost:3000/api/data | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log('stock:', d.stock.length, 'furniture:', d.furniture.length)"`
Expected: `stock: 38 furniture: 243`

- [ ] **Step 2: Deploy backend to Vercel (preview)**

Run: `vercel` (from `DASHBOARD-BACKEND-FRAK`, no flags → preview deployment)
Expected: deployment succeeds, prints a preview URL. Confirm `curl <preview-url>/api/data` returns the same `stock`/`furniture` counts as Step 1 (Atlas is shared between local and deployed).

---

## Frontend — `DASHBOARD-FRONTEND-FRAK`

### Task 9: `src/utils/stock.js` — shared status/zone helpers

**Files:**
- Create: `src/utils/stock.js`

**Interfaces:**
- Produces: `ZONES` (array of `{id, label}`), `zoneLabel(zoneId)`, `isLowStockConsumible(item)`, `isLowStockFurniture(item)`, `STATUS_META` (`{agotado, bajo, ok}` → `{label, color}`), `stockStatus(item, isStockZone)` → `'agotado'|'bajo'|'ok'`, `zoneStats(items, isStockZone)` → `{total, agotados, bajoStock}`. Consumed by Tasks 13, 14, 16, 17, 18.

- [ ] **Step 1: Write the utility module**

```js
// src/utils/stock.js
export const ZONES = [
  { id: 'stock',       label: 'Stock' },
  { id: 'living',      label: 'Living' },
  { id: 'comedor',     label: 'Comedor' },
  { id: 'cocina',      label: 'Cocina' },
  { id: 'baño',        label: 'Baño' },
  { id: 'lavanderia',  label: 'Lavandería' },
  { id: 'dormitorio1', label: 'Dormitorio 1' },
  { id: 'dormitorio2', label: 'Dormitorio 2' },
  { id: 'dormitorio3', label: 'Dormitorio 3' },
];

export function zoneLabel(zoneId) {
  return ZONES.find(z => z.id === zoneId)?.label ?? zoneId;
}

export function isLowStockConsumible(item) {
  return item.qtyBodega <= item.umbralUnidades || (item.pctEnUso != null && item.pctEnUso <= 15);
}

export function isLowStockFurniture(item) {
  return item.qty <= item.umbralUnidades;
}

export const STATUS_META = {
  agotado: { label: 'Agotado',    color: 'var(--signal-neg)' },
  bajo:    { label: 'Bajo Stock', color: 'var(--jat)' },
  ok:      { label: 'En Stock',   color: 'var(--signal-pos)' },
};

export function stockStatus(item, isStockZone) {
  const qty = isStockZone ? item.qtyBodega : item.qty;
  if (qty === 0) return 'agotado';
  const low = isStockZone ? isLowStockConsumible(item) : isLowStockFurniture(item);
  return low ? 'bajo' : 'ok';
}

export function zoneStats(items, isStockZone) {
  let agotados = 0, bajoStock = 0;
  for (const item of items) {
    const status = stockStatus(item, isStockZone);
    if (status === 'agotado') agotados++;
    else if (status === 'bajo') bajoStock++;
  }
  return { total: items.length, agotados, bajoStock };
}
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `node -e "console.log(1)"` is not applicable (ESM + JSX-free file, but relies on Vite's module resolution for `--` CSS vars only at usage time, not import time). Instead verify via lint:
Run: `npx eslint src/utils/stock.js`
Expected: no output (no lint errors).

- [ ] **Step 3: Commit**

```bash
git add src/utils/stock.js
git commit -m "feat: add stock/furniture status helpers"
```

---

### Task 10: `api.js` — stock/furniture HTTP methods

**Files:**
- Modify: `src/services/api.js`

**Interfaces:**
- Produces: `api.createStock`, `api.updateStock`, `api.deleteStock`, `api.createFurniture`, `api.updateFurniture`, `api.deleteFurniture`. Consumed by Tasks 13, 14.

- [ ] **Step 1: Add the methods to the `api` export**

Add these six entries to the `api` object in `src/services/api.js`, after `deleteTx` and before `exportUrl`:

```js
  createStock: (data) =>
    fetch(`${BASE}/api/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  updateStock: (id, data) =>
    fetch(`${BASE}/api/stock/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  deleteStock: (id) =>
    fetch(`${BASE}/api/stock/${id}`, { method: 'DELETE' }).then(json),

  createFurniture: (data) =>
    fetch(`${BASE}/api/furniture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  updateFurniture: (id, data) =>
    fetch(`${BASE}/api/furniture/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(json),

  deleteFurniture: (id) =>
    fetch(`${BASE}/api/furniture/${id}`, { method: 'DELETE' }).then(json),
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/services/api.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/services/api.js
git commit -m "feat: add stock/furniture API methods"
```

---

### Task 11: `useTransactions.js` — expose `setData`

**Files:**
- Modify: `src/hooks/useTransactions.js:45`

**Interfaces:**
- Produces: `setData` now included in the hook's return value. Consumed by Tasks 13, 14 (via `App.jsx`).

- [ ] **Step 1: Change the return statement**

In `src/hooks/useTransactions.js`, change:
```js
  return { data, loading, error, addTransaction, editTransaction, deleteTransaction };
```
to:
```js
  return { data, setData, loading, error, addTransaction, editTransaction, deleteTransaction };
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/hooks/useTransactions.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTransactions.js
git commit -m "feat: expose setData from useTransactions"
```

---

### Task 12: Icon.jsx — add `box` icon

**Files:**
- Modify: `src/components/ui/Icon.jsx:21`

**Interfaces:**
- Produces: `<Icon name="box" .../>` renders a package/box glyph. Consumed by Task 16, 17.

- [ ] **Step 1: Add the icon path**

In `src/components/ui/Icon.jsx`, add this line to the `ICONS` object, after the `coin` entry:
```js
  box:           'M3 6l7-3 7 3-7 3-7-3zM3 6v8l7 3 7-3V6M10 9v8',
```

- [ ] **Step 2: Verify visually**

Run `npm run dev`, open the app in a browser, temporarily render `<Icon name="box" size={24} />` anywhere (e.g. in `Topbar.jsx` next to the title) and confirm a box outline renders, then remove the temporary render.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Icon.jsx
git commit -m "feat: add box icon"
```

---

### Task 13: `useStock.js` and `useFurniture.js` hooks

**Files:**
- Create: `src/hooks/useStock.js`
- Create: `src/hooks/useFurniture.js`

**Interfaces:**
- Consumes: `api.createStock/updateStock/deleteStock/createFurniture/updateFurniture/deleteFurniture` (Task 10), `data`/`setData` from `useTransactions` (Task 11).
- Produces: `useStock(data, setData)` → `{addStockItem, editStockItem, deleteStockItem}`; `useFurniture(data, setData)` → `{addFurnitureItem, editFurnitureItem, deleteFurnitureItem}`. Consumed by Task 19 (`App.jsx`).

- [ ] **Step 1: Write `useStock.js`**

```js
// src/hooks/useStock.js
import { api } from '../services/api.js';

export function useStock(data, setData) {
  const addStockItem = async (itemData) => {
    const id = `stock-manual-${Date.now()}`;
    const newItem = { ...itemData, id };
    setData(prev => ({ ...prev, stock: [newItem, ...prev.stock] }));
    try {
      await api.createStock({ ...itemData, id });
    } catch {
      setData(prev => ({ ...prev, stock: prev.stock.filter(s => s.id !== id) }));
    }
  };

  const editStockItem = async (id, itemData) => {
    setData(prev => ({
      ...prev,
      stock: prev.stock.map(s => s.id === id ? { ...s, ...itemData } : s),
    }));
    try {
      await api.updateStock(id, itemData);
    } catch {
      api.getData().then(setData);
    }
  };

  const deleteStockItem = async (id) => {
    setData(prev => ({ ...prev, stock: prev.stock.filter(s => s.id !== id) }));
    await api.deleteStock(id);
  };

  return { addStockItem, editStockItem, deleteStockItem };
}
```

- [ ] **Step 2: Write `useFurniture.js`**

```js
// src/hooks/useFurniture.js
import { api } from '../services/api.js';

export function useFurniture(data, setData) {
  const addFurnitureItem = async (itemData) => {
    const id = `furniture-manual-${Date.now()}`;
    const newItem = { ...itemData, id };
    setData(prev => ({ ...prev, furniture: [newItem, ...prev.furniture] }));
    try {
      await api.createFurniture({ ...itemData, id });
    } catch {
      setData(prev => ({ ...prev, furniture: prev.furniture.filter(f => f.id !== id) }));
    }
  };

  const editFurnitureItem = async (id, itemData) => {
    setData(prev => ({
      ...prev,
      furniture: prev.furniture.map(f => f.id === id ? { ...f, ...itemData } : f),
    }));
    try {
      await api.updateFurniture(id, itemData);
    } catch {
      api.getData().then(setData);
    }
  };

  const deleteFurnitureItem = async (id) => {
    setData(prev => ({ ...prev, furniture: prev.furniture.filter(f => f.id !== id) }));
    await api.deleteFurniture(id);
  };

  return { addFurnitureItem, editFurnitureItem, deleteFurnitureItem };
}
```

- [ ] **Step 3: Verify**

Run: `npx eslint src/hooks/useStock.js src/hooks/useFurniture.js`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useStock.js src/hooks/useFurniture.js
git commit -m "feat: add useStock and useFurniture hooks"
```

---

### Task 14: `StockModal.jsx`

**Files:**
- Create: `src/components/StockModal.jsx`

**Interfaces:**
- Consumes: `zoneLabel` from `src/utils/stock.js` (Task 9), `Icon` from `src/components/ui/Icon.jsx`.
- Produces: `<StockModal open item isStockZone zone onSave onDelete onClose />`. `onSave` receives the built payload object (see Step 1). Consumed by Task 17 (`Stock.jsx`).

- [ ] **Step 1: Write the component**

```jsx
// src/components/StockModal.jsx
import { useState, useEffect } from 'react';
import { Icon } from './ui/Icon.jsx';
import { zoneLabel } from '../utils/stock.js';

const EMPTY = { category: '', name: '', qty: '', unit: '', pctEnUso: '', umbral: '1' };

function validate(f) {
  const e = {};
  if (!f.name.trim())     e.name = 'El nombre es requerido';
  if (!f.category.trim()) e.category = 'La categoría es requerida';
  if (f.qty === '')                                    e.qty = 'La cantidad es requerida';
  else if (isNaN(Number(f.qty)) || Number(f.qty) < 0)  e.qty = 'Ingresa un número válido';
  if (f.umbral === '')                                     e.umbral = 'El umbral es requerido';
  else if (isNaN(Number(f.umbral)) || Number(f.umbral) < 0) e.umbral = 'Ingresa un número válido';
  if (f.pctEnUso !== '' && (isNaN(Number(f.pctEnUso)) || Number(f.pctEnUso) < 0 || Number(f.pctEnUso) > 100))
    e.pctEnUso = 'Ingresa un valor entre 0 y 100';
  return e;
}

export function StockModal({ open, item, isStockZone, zone, onSave, onDelete, onClose }) {
  const [form, setForm]          = useState(EMPTY);
  const [errors, setErrors]      = useState({});
  const [confirmDel, setConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      if (item) {
        setForm({
          category: item.category,
          name: item.name,
          qty: String(isStockZone ? item.qtyBodega : item.qty),
          unit: item.unit ?? '',
          pctEnUso: item.pctEnUso == null ? '' : String(item.pctEnUso),
          umbral: String(item.umbralUnidades),
        });
      } else {
        setForm(EMPTY);
      }
      setErrors({});
      setConfirm(false);
    }
  }, [open, item, isStockZone]);

  if (!open) return null;

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => { const n = { ...e }; delete n[k]; return n; });
  };

  const handleSubmit = () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    const base = {
      category: form.category.trim(),
      name: form.name.trim(),
      umbralUnidades: Number(form.umbral),
    };
    const payload = isStockZone
      ? { ...base, property: 'pac', unit: form.unit.trim(), qtyBodega: Number(form.qty), pctEnUso: form.pctEnUso === '' ? null : Number(form.pctEnUso) }
      : { ...base, qty: Number(form.qty) };
    onSave(payload);
  };

  const isEdit = !!item;

  return (
    <div className="v-modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="v-modal" onClick={e => e.stopPropagation()}>
        <div className="v-modal-head">
          <div>
            <div className="v-modal-eyebrow">{isEdit ? 'Editar' : 'Nuevo producto'}{zone ? ` · ${zoneLabel(zone)}` : ''}</div>
            <div className="v-modal-title">{isEdit ? 'Editar producto' : 'Nuevo producto'}</div>
          </div>
          <button className="v-modal-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14"/>
            </svg>
          </button>
        </div>

        <div className="v-form-row">
          <div className="v-form-label">Nombre</div>
          <input className={'v-input' + (errors.name ? ' v-input-error' : '')}
            placeholder="ej: jabón 750ml, Sofá 3 Cuerpos…"
            value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          {errors.name && <div className="v-form-error">{errors.name}</div>}
        </div>

        <div className="v-form-row">
          <div className="v-form-label">Categoría</div>
          <input className={'v-input' + (errors.category ? ' v-input-error' : '')}
            placeholder="ej: ASEO, Muebles, Vajilla…"
            value={form.category} onChange={e => set('category', e.target.value)} />
          {errors.category && <div className="v-form-error">{errors.category}</div>}
        </div>

        <div className="v-form-row-split">
          <div className="v-form-row">
            <div className="v-form-label">{isStockZone ? 'Cantidad en bodega' : 'Cantidad'}</div>
            <input className={'v-input' + (errors.qty ? ' v-input-error' : '')}
              type="number" min="0" value={form.qty} onChange={e => set('qty', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }} />
            {errors.qty && <div className="v-form-error">{errors.qty}</div>}
          </div>
          <div className="v-form-row">
            <div className="v-form-label">Umbral de alerta</div>
            <input className={'v-input' + (errors.umbral ? ' v-input-error' : '')}
              type="number" min="0" value={form.umbral} onChange={e => set('umbral', e.target.value)}
              style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }} />
            {errors.umbral && <div className="v-form-error">{errors.umbral}</div>}
          </div>
        </div>

        {isStockZone && (
          <div className="v-form-row-split">
            <div className="v-form-row">
              <div className="v-form-label">Unidad</div>
              <input className="v-input" placeholder="ej: 750ml, rollo, litro…"
                value={form.unit} onChange={e => set('unit', e.target.value)} />
            </div>
            <div className="v-form-row">
              <div className="v-form-label">% en uso (opcional)</div>
              <input className={'v-input' + (errors.pctEnUso ? ' v-input-error' : '')}
                type="number" min="0" max="100" placeholder="ej: 30" value={form.pctEnUso}
                onChange={e => set('pctEnUso', e.target.value)}
                style={{ fontFamily: 'var(--font-mono)', textAlign: 'right' }} />
              {errors.pctEnUso && <div className="v-form-error">{errors.pctEnUso}</div>}
            </div>
          </div>
        )}

        {confirmDel ? (
          <div style={{ marginTop: 18, padding: 14, background: 'rgba(212,58,42,0.06)', border: '1px solid var(--signal-neg)', borderRadius: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>¿Eliminar este producto?</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 12 }}>Esta acción no se puede deshacer.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="v-btn ghost" onClick={() => setConfirm(false)}>Cancelar</button>
              <button className="v-btn" style={{ background: 'var(--signal-neg)', color: '#fff', borderColor: 'var(--signal-neg)' }}
                onClick={() => onDelete(item.id)}>
                <Icon name="trash" size={13} /> Sí, eliminar
              </button>
            </div>
          </div>
        ) : (
          <div className="v-modal-foot">
            {isEdit && (
              <button className="v-btn ghost" style={{ color: 'var(--signal-neg)', marginRight: 'auto' }}
                onClick={() => setConfirm(true)}>
                <Icon name="trash" size={13} /> Eliminar
              </button>
            )}
            <button className="v-btn" onClick={onClose}>Cancelar</button>
            <button className="v-btn primary" onClick={handleSubmit}>
              {isEdit ? 'Guardar cambios' : 'Crear producto'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/components/StockModal.jsx`
Expected: no output. Full interactive verification happens in Task 20 (App wiring).

- [ ] **Step 3: Commit**

```bash
git add src/components/StockModal.jsx
git commit -m "feat: add StockModal"
```

---

### Task 15: `NavItem.jsx` and `Sidebar.jsx` — alert badge support

**Files:**
- Modify: `src/components/layout/NavItem.jsx`
- Modify: `src/components/layout/Sidebar.jsx`

**Interfaces:**
- Produces: `<Sidebar badgeCounts={{stock: 3}} .../>` renders a red count badge next to the matching nav item. Consumed by Task 19 (`App.jsx`).

- [ ] **Step 1: Rewrite `NavItem.jsx`**

```jsx
// src/components/layout/NavItem.jsx
import { Icon } from '../ui/Icon.jsx';

export function NavItem({ item, active, onClick, badgeCount }) {
  const supremeClass = item.supreme === 'pos' ? 'supreme-pos' : item.supreme === 'neg' ? 'supreme-neg' : '';
  return (
    <button
      className={`v-nav-item ${supremeClass}${active ? ' active' : ''}`}
      onClick={() => onClick(item.id)}
    >
      <Icon name={item.icon} size={15} color="currentColor" />
      <span>{item.label}</span>
      {badgeCount > 0 && (
        <span style={{
          marginLeft: 'auto', background: 'var(--signal-neg)', color: '#fff',
          fontSize: 10, fontWeight: 700, borderRadius: 10, padding: '1px 6px',
          fontFamily: 'var(--font-mono)',
        }}>{badgeCount}</span>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Rewrite `Sidebar.jsx`**

```jsx
// src/components/layout/Sidebar.jsx
import { NAV_GROUPS } from '../../utils/categories.js';
import { NavItem } from './NavItem.jsx';

export function Sidebar({ view, setView, year, badgeCounts = {} }) {
  return (
    <aside className="v-sidebar">
      <div className="v-brand">
        <div className="v-brand-mark">S</div>
        <div>
          <div className="v-brand-name">Send Austral</div>
          <div className="v-brand-sub">Contabilidad · {year}</div>
        </div>
      </div>

      <nav style={{ flex: 1 }}>
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="v-nav-group-label">{group.label}</div>
            {group.items.map(item => (
              <NavItem key={item.id} item={item} active={view === item.id} onClick={setView} badgeCount={badgeCounts[item.id]} />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx eslint src/components/layout/NavItem.jsx src/components/layout/Sidebar.jsx`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/NavItem.jsx src/components/layout/Sidebar.jsx
git commit -m "feat: add alert badge support to sidebar nav items"
```

---

### Task 16: `categories.js` — add Stock nav entry

**Files:**
- Modify: `src/utils/categories.js:2-22`

**Interfaces:**
- Produces: a `stock` entry in `NAV_GROUPS` with `icon: 'box'`. Consumed by Task 15's `Sidebar.jsx` (already reads `NAV_GROUPS`), and gives `App.jsx`'s router a `'stock'` view id to match against (Task 19).

- [ ] **Step 1: Add the group**

In `src/utils/categories.js`, add this group to the `NAV_GROUPS` array, after the `'Negocios'` group and before `'Socio'`:

```js
  { label: 'Operaciones', items: [
    { id: 'stock', label: 'Stock', icon: 'box' },
  ]},
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/utils/categories.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/utils/categories.js
git commit -m "feat: add Stock nav entry"
```

---

### Task 17: `StockOverview.jsx` — zone grid + stats

**Files:**
- Create: `src/components/views/StockOverview.jsx`

**Interfaces:**
- Consumes: `ZONES`, `zoneStats`, `STATUS_META` from `src/utils/stock.js` (Task 9), `Icon` from `src/components/ui/Icon.jsx`.
- Produces: `<StockOverview stock furniture onSelectZone />`. Consumed by Task 19 (`Stock.jsx`).

- [ ] **Step 1: Write the component**

```jsx
// src/components/views/StockOverview.jsx
import { Icon } from '../ui/Icon.jsx';
import { ZONES, zoneStats, STATUS_META } from '../../utils/stock.js';

export function StockOverview({ stock, furniture, onSelectZone }) {
  const totalProductos = stock.length + furniture.length;
  const stockStats = zoneStats(stock, true);
  const furnitureStats = zoneStats(furniture, false);
  const porAgotar = stockStats.bajoStock + furnitureStats.bajoStock;
  const agotados = stockStats.agotados + furnitureStats.agotados;

  return (
    <div>
      <div className="v-section-head">
        <div>
          <div className="v-eyebrow">Operaciones</div>
          <h1 className="v-section-title">Inventario <em>por zona</em>.</h1>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="v-card">
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>Total Productos</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28 }}>{totalProductos}</div>
        </div>
        <div className="v-card">
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>Por Agotar</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--jat)' }}>{porAgotar}</div>
        </div>
        <div className="v-card">
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 6 }}>Agotados</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--signal-neg)' }}>{agotados}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
        {ZONES.map(z => {
          const zoneItems = z.id === 'stock' ? stock : furniture.filter(f => f.zone === z.id);
          const stats = zoneStats(zoneItems, z.id === 'stock');
          const status = stats.agotados > 0 ? 'agotado' : stats.bajoStock > 0 ? 'bajo' : 'ok';
          const meta = STATUS_META[status];
          return (
            <button key={z.id} className="v-card" onClick={() => onSelectZone(z.id)}
              style={{ textAlign: 'left', cursor: 'pointer', border: 'none', display: 'block', width: '100%', font: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <Icon name="box" size={18} color="var(--ink-2)" />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 8px', borderRadius: 10, background: meta.color + '22', color: meta.color }}>
                  {stats.agotados > 0 ? `${stats.agotados} out of stock` : stats.bajoStock > 0 ? `${stats.bajoStock} items low stock` : 'All Good'}
                </span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>{z.label}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{stats.total} Total Items</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/components/views/StockOverview.jsx`
Expected: no output. Full interactive verification happens in Task 20.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/StockOverview.jsx
git commit -m "feat: add StockOverview zone grid view"
```

---

### Task 18: `ZoneDetail.jsx` — generic CRUD table

**Files:**
- Create: `src/components/views/ZoneDetail.jsx`

**Interfaces:**
- Consumes: `zoneLabel`, `stockStatus`, `STATUS_META` from `src/utils/stock.js` (Task 9).
- Produces: `<ZoneDetail zone isStockZone items onBack onAdd onEdit />`. Consumed by Task 19 (`Stock.jsx`).

- [ ] **Step 1: Write the component**

```jsx
// src/components/views/ZoneDetail.jsx
import { useState } from 'react';
import { Icon } from '../ui/Icon.jsx';
import { zoneLabel, stockStatus, STATUS_META } from '../../utils/stock.js';

export function ZoneDetail({ zone, isStockZone, items, onBack, onAdd, onEdit }) {
  const [search, setSearch]                 = useState('');
  const [categoryFilter, setCategoryFilter]  = useState('');
  const [statusFilter, setStatusFilter]      = useState('');

  const categories = [...new Set(items.map(i => i.category))].sort();

  const filtered = items.filter(i => {
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (categoryFilter && i.category !== categoryFilter) return false;
    if (statusFilter && stockStatus(i, isStockZone) !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="v-section-head">
        <div>
          <div className="v-eyebrow">Operaciones</div>
          <h1 className="v-section-title">Gestión de Zona <em>Detalle CRUD</em>.</h1>
        </div>
        <button className="v-btn" onClick={onBack}>
          <Icon name="arrow_up" size={12} style={{ transform: 'rotate(-90deg)' }} /> Back to Overview
        </button>
      </div>

      <div className="v-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Inventario - {zoneLabel(zone).toUpperCase()}</div>
          <button className="v-btn primary" onClick={onAdd}>
            <Icon name="plus" size={13} /> Nuevo Producto
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Icon name="search" size={14} color="var(--ink-3)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input className="v-input" style={{ paddingLeft: 36 }} placeholder="Buscar productos…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="v-select" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">Categoría</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="v-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Estado</option>
            <option value="ok">En Stock</option>
            <option value="bajo">Bajo Stock</option>
            <option value="agotado">Agotado</option>
          </select>
        </div>

        {filtered.length === 0 && <div className="v-empty">Sin productos.</div>}

        {filtered.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: 11, color: 'var(--ink-3)' }}>PRODUCTO</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: 11, color: 'var(--ink-3)' }}>CATEGORÍA</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: 11, color: 'var(--ink-3)' }}>STOCK</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', fontSize: 11, color: 'var(--ink-3)' }}>ESTADO</th>
                <th style={{ textAlign: 'right', padding: '8px 4px', fontSize: 11, color: 'var(--ink-3)' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const status = stockStatus(item, isStockZone);
                const meta = STATUS_META[status];
                const qty = isStockZone ? item.qtyBodega : item.qty;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--line)' }}>
                    <td style={{ padding: '10px 4px' }}>
                      {item.name}
                      {isStockZone && item.pctEnUso != null && (
                        <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>En uso: {item.pctEnUso}%</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 4px', color: 'var(--ink-2)' }}>{item.category}</td>
                    <td style={{ padding: '10px 4px', fontFamily: 'var(--font-mono)' }}>{qty}</td>
                    <td style={{ padding: '10px 4px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: meta.color }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color }} />
                        {meta.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 4px', textAlign: 'right' }}>
                      <button className="v-btn ghost" style={{ padding: 6 }} onClick={() => onEdit(item)}>
                        <Icon name="edit" size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/components/views/ZoneDetail.jsx`
Expected: no output. Full interactive verification happens in Task 20.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/ZoneDetail.jsx
git commit -m "feat: add ZoneDetail CRUD table view"
```

---

### Task 19: `Stock.jsx` — wrapper view (overview ↔ detail navigation + modal wiring)

**Files:**
- Create: `src/components/views/Stock.jsx`

**Interfaces:**
- Consumes: `StockOverview` (Task 17), `ZoneDetail` (Task 18), `StockModal` (Task 14).
- Produces: `<Stock stock furniture addStockItem editStockItem deleteStockItem addFurnitureItem editFurnitureItem deleteFurnitureItem showToast />`. Consumed by Task 20 (`App.jsx`).

- [ ] **Step 1: Write the component**

```jsx
// src/components/views/Stock.jsx
import { useState } from 'react';
import { StockOverview } from './StockOverview.jsx';
import { ZoneDetail } from './ZoneDetail.jsx';
import { StockModal } from '../StockModal.jsx';

export function Stock({
  stock, furniture,
  addStockItem, editStockItem, deleteStockItem,
  addFurnitureItem, editFurnitureItem, deleteFurnitureItem,
  showToast,
}) {
  const [zone, setZone]         = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem]   = useState(null);

  const isStockZone = zone === 'stock';
  const items = zone === null ? [] : isStockZone ? stock : furniture.filter(f => f.zone === zone);

  const handleAdd  = () => { setEditItem(null); setModalOpen(true); };
  const handleEdit = (item) => { setEditItem(item); setModalOpen(true); };
  const handleClose = () => { setModalOpen(false); setEditItem(null); };

  const handleSave = async (itemData) => {
    if (isStockZone) {
      if (editItem) { await editStockItem(editItem.id, itemData); showToast('Producto actualizado'); }
      else          { await addStockItem(itemData);              showToast('Producto creado'); }
    } else {
      const payload = { ...itemData, zone };
      if (editItem) { await editFurnitureItem(editItem.id, payload); showToast('Producto actualizado'); }
      else           { await addFurnitureItem(payload);               showToast('Producto creado'); }
    }
    handleClose();
  };

  const handleDelete = async (id) => {
    if (isStockZone) await deleteStockItem(id);
    else              await deleteFurnitureItem(id);
    showToast('Producto eliminado', 'error');
    handleClose();
  };

  return (
    <div>
      {zone === null ? (
        <StockOverview stock={stock} furniture={furniture} onSelectZone={setZone} />
      ) : (
        <ZoneDetail
          zone={zone}
          isStockZone={isStockZone}
          items={items}
          onBack={() => setZone(null)}
          onAdd={handleAdd}
          onEdit={handleEdit}
        />
      )}
      <StockModal
        open={modalOpen}
        item={editItem}
        isStockZone={isStockZone}
        zone={zone}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={handleClose}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx eslint src/components/views/Stock.jsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/views/Stock.jsx
git commit -m "feat: add Stock wrapper view"
```

---

### Task 20: Wire everything into `App.jsx`

**Files:**
- Modify: `src/App.jsx` (full file)

**Interfaces:**
- Consumes: `useStock` (Task 13), `useFurniture` (Task 13), `Stock` (Task 19), `isLowStockConsumible` (Task 9), `setData` from `useTransactions` (Task 11), `badgeCounts` prop on `Sidebar` (Task 15).

- [ ] **Step 1: Rewrite `App.jsx`**

```jsx
// src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { useTransactions } from './hooks/useTransactions.js';
import { useFilter } from './hooks/useFilter.js';
import { useToast } from './hooks/useToast.js';
import { useStock } from './hooks/useStock.js';
import { useFurniture } from './hooks/useFurniture.js';
import { Sidebar } from './components/layout/Sidebar.jsx';
import { Topbar } from './components/layout/Topbar.jsx';
import { ToastContainer } from './components/ui/Toast.jsx';
import { Modal } from './components/Modal.jsx';
import { Overview } from './components/views/Overview.jsx';
import { Ingresos } from './components/views/Ingresos.jsx';
import { Costos } from './components/views/Costos.jsx';
import { Transactions } from './components/views/Transactions.jsx';
import { Calendar } from './components/views/Calendar.jsx';
import { Gastos } from './components/views/Gastos.jsx';
import { Socio } from './components/views/Socio.jsx';
import { AveAustral } from './components/views/AveAustral.jsx';
import { Budget } from './components/views/Budget.jsx';
import { Stock } from './components/views/Stock.jsx';
import { isLowStockConsumible } from './utils/stock.js';

const VIEW_TITLE = {
  overview: 'Resumen',
  ingresos: 'Ingresos',
  costos: 'Costos',
  transactions: 'Movimientos',
  calendar: 'Vista mensual',
  gastos: 'Costos',
  socio: 'Mov. de socio',
  ave_austral: 'Ave Austral',
  budget: 'Presupuesto 2026',
  stock: 'Stock',
};

export default function App() {
  const [view, setView] = useState('overview');
  const [modalOpen, setModalOpen] = useState(false);
  const [editTx, setEditTx] = useState(null);

  const { data, setData, loading, error, addTransaction, editTransaction, deleteTransaction } = useTransactions();
  const { year, setYear, period, setPeriod, filteredTx, monthsOrder } = useFilter(
    data?.transactions, data?.monthsOrder2025, data?.monthsOrder2026
  );
  const { toasts, showToast } = useToast();
  const { addStockItem, editStockItem, deleteStockItem } = useStock(data, setData);
  const { addFurnitureItem, editFurnitureItem, deleteFurnitureItem } = useFurniture(data, setData);

  const toastedLowStockRef = useRef(false);
  useEffect(() => {
    if (!loading && data && !toastedLowStockRef.current) {
      toastedLowStockRef.current = true;
      const n = data.stock.filter(isLowStockConsumible).length;
      if (n > 0) showToast(`Tienes ${n} producto${n === 1 ? '' : 's'} con stock bajo`, 'error');
    }
  }, [loading, data]);

  const handleAdd = () => { setEditTx(null); setModalOpen(true); };
  const handleEdit = (tx) => { setEditTx(tx); setModalOpen(true); };
  const handleClose = () => { setModalOpen(false); setEditTx(null); };

  const handleSave = async (txData) => {
    if (editTx) {
      await editTransaction(editTx.id, txData);
      showToast('Movimiento actualizado');
    } else {
      await addTransaction(txData);
      showToast('Movimiento creado');
    }
    handleClose();
  };

  const handleDelete = async (id) => {
    await deleteTransaction(id);
    showToast('Movimiento eliminado', 'error');
    handleClose();
  };

  const viewProps = { filteredTx, categoryMeta: data?.categoryMeta, onEdit: handleEdit };
  const stockAlertCount = data ? data.stock.filter(isLowStockConsumible).length : 0;

  return (
    <div className="vault-app">
      <Sidebar view={view} setView={setView} year={year} badgeCounts={{ stock: stockAlertCount }} />
      <main className="v-main">
        <Topbar
          title={VIEW_TITLE[view] ?? view}
          year={year} setYear={setYear}
          period={period} setPeriod={setPeriod}
          monthsOrder={monthsOrder}
          monthLabels={data?.monthLabels}
          onAdd={handleAdd}
        />
        <div className="v-content" key={view}>
          {loading && <div className="v-empty" style={{ padding: '80px 0', textAlign: 'center' }}>Cargando datos…</div>}
          {error && <div className="v-empty" style={{ padding: '80px 0', textAlign: 'center', color: 'var(--signal-neg)' }}>Error al cargar datos. Intenta recargar la página.</div>}
          {data && !loading && (
            <>
              {view === 'overview'     && <Overview {...viewProps} transactions={data.transactions} monthsOrder={monthsOrder} monthLabels={data.monthLabels} period={period} setPeriod={setPeriod} />}
              {view === 'ingresos'     && <Ingresos {...viewProps} />}
              {view === 'costos'       && <Costos {...viewProps} />}
              {view === 'transactions' && <Transactions {...viewProps} />}
              {view === 'calendar'     && <Calendar {...viewProps} monthsOrder={monthsOrder} monthLabels={data.monthLabels} />}
              {view === 'gastos'       && <Gastos {...viewProps} />}
              {view === 'socio'        && <Socio {...viewProps} properties={data.properties} />}
              {view === 'ave_austral'  && <AveAustral {...viewProps} />}
              {view === 'budget'       && <Budget transactions={data.transactions} categoryMeta={data.categoryMeta} />}
              {view === 'stock'        && (
                <Stock
                  stock={data.stock} furniture={data.furniture}
                  addStockItem={addStockItem} editStockItem={editStockItem} deleteStockItem={deleteStockItem}
                  addFurnitureItem={addFurnitureItem} editFurnitureItem={editFurnitureItem} deleteFurnitureItem={deleteFurnitureItem}
                  showToast={showToast}
                />
              )}
            </>
          )}
        </div>
      </main>
      <Modal
        open={modalOpen}
        tx={editTx}
        categoryMeta={data?.categoryMeta}
        properties={data?.properties}
        onSave={handleSave}
        onDelete={handleDelete}
        onClose={handleClose}
      />
      <ToastContainer toasts={toasts} />
    </div>
  );
}
```

- [ ] **Step 2: Verify with lint**

Run: `npx eslint src/App.jsx`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire Stock view into App"
```

---

### Task 21: Full interactive verification

**Files:** none (verification-only task)

- [ ] **Step 1: Point the frontend at the deployed backend and start the dev server**

Confirm `.env` (or `.env.local`) in `DASHBOARD-FRONTEND-FRAK` has `VITE_API_URL` pointing at the backend preview URL from Task 8, Step 2 (or `http://localhost:3000` if running `vercel dev` locally from the backend repo).
Run: `npm run dev` from `DASHBOARD-FRONTEND-FRAK`.

- [ ] **Step 2: Walk the golden path in a browser**

Open the dev server URL. Confirm:
1. A toast appears on load: "Tienes N productos con stock bajo" (N > 0, since the seeded data has several `qtyBodega: 0` / low `pctEnUso` items).
2. Sidebar shows a "Stock" item under "Operaciones" with a red badge matching that count.
3. Clicking "Stock" shows the zone grid: 9 cards (Stock + 8 rooms), each with a total-items count and a status badge; top stat row shows Total Productos / Por Agotar / Agotados summing both models.
4. Clicking the "Cocina" card (highest item count, 105+18=123 items) shows the CRUD table; search and category/estado filters narrow the list.
5. Click "Nuevo Producto" → fill the form → save → new row appears in the table without a full page reload.
6. Click the edit icon on a row → change quantity to `0` → save → row's Estado badge turns "Agotado" (red).
7. Open that same item again → click "Eliminar" → confirm → row disappears.
8. Click "Back to Overview" → the "Cocina" card's counts reflect the edits just made.
9. Click the "Stock" card (consumibles) → confirm the table shows a "% en uso" line under item names that have `pctEnUso` set, and the edit modal shows the extra Unidad/% en uso fields that room-zone items don't have.

- [ ] **Step 3: Confirm no regressions in the existing app**

Click through Resumen, Movimientos, Vista mensual, Costos, Mov. de socio, Presupuesto 2026 — confirm they still render and the existing transaction add/edit/delete modal still works (unrelated to this change, but `App.jsx` was fully rewritten in Task 20 so a regression there would break everything).

---

## Self-Review Notes

- **Spec coverage:** every section of `2026-07-07-stock-module-design.md` maps to a task — `StockItem`/`FurnitureItem` models (Tasks 1-2), CRUD endpoints (Tasks 3-4), `GET /api/data` bundling (Task 5), seed scripts (Tasks 6-7), hooks (Task 13), sidebar badge scoped to `StockItem` only (Task 15/20 — `stockAlertCount` only reads `data.stock`, never `data.furniture`, matching the spec's explicit exclusion), overview stats summing both models (Task 17), shared CRUD table with `pctEnUso` only on the `stock` zone (Task 18), no "Actividad Reciente" anywhere (intentionally absent from Tasks 17/19).
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `StockItem` fields (`qtyBodega`, `pctEnUso`, `umbralUnidades`) and `FurnitureItem` fields (`qty`, `umbralUnidades`) are used identically across the model (Tasks 1-2), the `buildDiegoData` mapping (Task 5), the hooks (Task 13), `stockStatus`/`isLowStock*` (Task 9), `StockModal`'s payload builder (Task 14), and `ZoneDetail`'s table rendering (Task 18) — verified no drift between task boundaries.
- **Data grounding:** seed script column indices and item counts (38 stock / 243 furniture) were verified by dry-running the parsing logic against the real `Inventario casa PAC.xlsx` file, not assumed from the spec text alone — this caught and corrected two spec-level inaccuracies (the "en uso" value/name columns are L/M not K/L; two "Reposición de artículos" items are laundry, not kitchen, so a keyword override was added in Task 7 beyond the spec's literal "all → cocina" description). Both corrections are documented inline in the affected tasks.
