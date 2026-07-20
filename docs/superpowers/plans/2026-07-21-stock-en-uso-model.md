# Stock "En uso" Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `StockItem`'s ad-hoc `pctEnUso`/`reusable` fields with a unified `enUso` array model (implements `docs/superpowers/specs/2026-07-21-stock-en-uso-model-design.md`), migrating all existing production data without loss, then update the alert logic and edit UI to match.

**Architecture:** Backend schema + one-off migration script first (with a mandatory JSON backup step), then frontend alert-logic and UI changes. The migration is the highest-risk step — Diego's colleague is actively entering real data into production, so it must read fresh data at run time and never assume the counts/names captured earlier in this session are still accurate.

**Tech Stack:** Mongoose/MongoDB (backend), React (frontend). No test runner in either repo (established convention) — verification is manual, backed by the mandatory backup for this specific migration.

## Global Constraints

- **Never delete or lose real stock data.** Every `qtyBodega` and every `%` value currently in the database must be traceable in the post-migration data — either preserved directly or explicitly merged per the spec's "Migración de datos existentes" section.
- **Take a full JSON backup of the `StockItem` collection immediately before running the migration**, and do not proceed with the migration until that backup file exists on disk and has a non-zero item count matching the live collection.
- **Read live data at migration time, not assumptions from earlier in this session.** Diego's colleague is actively adding/editing stock items — the migration script must query MongoDB fresh when it runs, and must handle any items that weren't part of this session's earlier investigation (i.e., don't hardcode a fixed list of "all items that exist" — only hardcode the specific known merge-pairs by name, and apply the generic pctEnUso→enUso conversion to everything else via a general rule).
- `umbralPctCritico` is a fixed code constant (60), not a per-item field, per the spec's explicit "Fuera de alcance."
- Do not touch `FurnitureItem` — out of scope, unaffected by this model.

---

### Task 1: Backend schema change

**Files:**
- Modify: `DASHBOARD-BACKEND-FRAK/lib/models/StockItem.js`
- Modify: `DASHBOARD-BACKEND-FRAK/lib/buildDiegoData.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StockItem.enUso: [{ pct: Number }]` — the array every later task (migration, frontend) reads/writes. `qtyBodega` and `umbralUnidades` keep their existing names/types, unchanged.

- [ ] **Step 1: Update the Mongoose schema**

In `lib/models/StockItem.js`, replace:

```js
const schema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  property:       String,
  category:       String,
  name:           String,
  unit:           String,
  qtyBodega:      Number,
  pctEnUso:       { type: Number, default: null },
  umbralUnidades: { type: Number, default: 1 },
  // Discrete multi-unit items (sponges, cloths) — pctEnUso here tracks the
  // wear of whichever one is currently active, not overall supply. Supply
  // is qtyBodega/umbralUnidades alone; see isLowStockConsumible in
  // utils/stock.js on the frontend for where this is consumed.
  reusable:       { type: Boolean, default: false },
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});
```

with:

```js
const enUsoUnitSchema = new mongoose.Schema({
  pct: { type: Number, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  property:       String,
  category:       String,
  name:           String,
  unit:           String,
  qtyBodega:      Number,
  // Currently-active units, each with its own remaining %. Empty array
  // for items nobody tracks a % for (sponges/cloths/gloves — supply is
  // qtyBodega/umbralUnidades alone). See utils/stock.js's stockStatus on
  // the frontend for how this drives (or doesn't drive) the alert.
  enUso:          { type: [enUsoUnitSchema], default: [] },
  umbralUnidades: { type: Number, default: 1 },
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});
```

(`pctEnUso` and `reusable` are dropped from the schema. Existing documents' stored `pctEnUso`/`reusable` values are NOT explicitly `$unset` by this change — they become orphaned/unused fields Mongoose no longer reads or writes, which is safer than an active deletion. Task 2's migration script populates `enUso` from those same orphaned values before they stop being read anywhere.)

- [ ] **Step 2: Thread `enUso` through `buildDiegoData`**

In `lib/buildDiegoData.js`, find:

```js
    stock: stockItems.map(s => ({
      id: s.id, property: s.property, category: s.category, name: s.name,
      unit: s.unit, qtyBodega: s.qtyBodega, pctEnUso: s.pctEnUso, umbralUnidades: s.umbralUnidades,
      reusable: s.reusable,
    })),
```

Replace with:

```js
    stock: stockItems.map(s => ({
      id: s.id, property: s.property, category: s.category, name: s.name,
      unit: s.unit, qtyBodega: s.qtyBodega, enUso: s.enUso, umbralUnidades: s.umbralUnidades,
    })),
```

- [ ] **Step 3: Verify the schema change alone doesn't break anything**

Run: `cd DASHBOARD-BACKEND-FRAK && node --env-file=.env -e "import('mongoose').then(async m=>{const c=m.default;await c.connect(process.env.MONGODB_URI);const StockItem=(await import('./lib/models/StockItem.js')).default;const one=await StockItem.findOne({}).lean();console.log(JSON.stringify(one));await c.disconnect();});"`

Expected: no error, prints an existing item (still with its old `pctEnUso`/`reusable` fields visible in the raw lean doc — that's expected and fine, Task 2 migrates them). Do NOT deploy this commit yet — Task 2's migration must run against this new schema shape first, from a local script, before anything is pushed to production (pushing now would make `GET /api/data` start returning `enUso: []` for every item, silently hiding all existing % data in the live UI until the migration runs).

- [ ] **Step 4: Commit (do not push yet)**

```bash
cd DASHBOARD-BACKEND-FRAK
git add lib/models/StockItem.js lib/buildDiegoData.js
git commit -m "feat: replace StockItem pctEnUso/reusable with enUso array"
```

---

### Task 2: Backup and migrate existing data

**Files:**
- Create: `DASHBOARD-BACKEND-FRAK/scripts/backup-stock-2026-07-21.js`
- Create: `DASHBOARD-BACKEND-FRAK/scripts/migrate-stock-en-uso-2026-07-21.js`

**Interfaces:**
- Consumes: the schema from Task 1 (must be committed locally, does not need to be deployed — this script connects directly to MongoDB via `MONGODB_URI`, bypassing the API entirely, same pattern as every other one-off script this session).
- Produces: every `StockItem` document updated in place with a populated `enUso` array; the known bodega/en-uso row pairs merged into single documents.

- [ ] **Step 1: Write the backup script**

Create `scripts/backup-stock-2026-07-21.js`:

```js
// scripts/backup-stock-2026-07-21.js — run: node --env-file=.env scripts/backup-stock-2026-07-21.js
// Safety net before scripts/migrate-stock-en-uso-2026-07-21.js — Diego's
// colleague is actively editing stock data in production, so this dumps
// the exact live state immediately before any migration touches it.
import mongoose from 'mongoose';
import fs from 'fs';
import StockItem from '../lib/models/StockItem.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  const items = await StockItem.find({}).lean();
  const path = `./stock-backup-${Date.now()}.json`;
  fs.writeFileSync(path, JSON.stringify(items, null, 2));
  console.log(`Backed up ${items.length} StockItem documents to ${path}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Run the backup and verify it**

```bash
cd DASHBOARD-BACKEND-FRAK
node --env-file=.env scripts/backup-stock-2026-07-21.js
```

Confirm the printed count matches a fresh live count (run the same one-liner from Task 1/Step 3 but with `.countDocuments({})` instead of `.findOne({})`), and confirm the backup JSON file exists and its item count in the file matches:

```bash
node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).length)" ./stock-backup-*.json
```

**Do not proceed to Step 3 until this count matches.** If it doesn't, stop and report — do not guess why.

- [ ] **Step 3: Write the migration script**

Create `scripts/migrate-stock-en-uso-2026-07-21.js`. This handles three cases per the design spec: (a) the known merge-pairs, by exact current name, (b) items with a numeric `pctEnUso` (reusable or not) → `enUso: [{ pct }]`, (c) items with `pctEnUso: null` → `enUso: []`.

```js
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
    const mergedName = bodegaName.replace(/\s*\(bodega\)\s*/i, '').trim();
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
```

- [ ] **Step 4: Run the migration**

```bash
cd DASHBOARD-BACKEND-FRAK
node --env-file=.env scripts/migrate-stock-en-uso-2026-07-21.js
```

Read the full output. Confirm:
- The final count dropped by exactly the number of merge pairs found (2, unless one was skipped — if skipped, that's fine, just confirm the math in the printed line adds up).
- No unexpected errors mid-run.

- [ ] **Step 5: Spot-check the migration against the backup**

Run this verification against the live data, comparing a handful of specific items to their backup values:

```bash
node --env-file=.env -e "
import('mongoose').then(async (m) => {
  const mongoose = m.default;
  await mongoose.connect(process.env.MONGODB_URI);
  const StockItem = (await import('./lib/models/StockItem.js')).default;
  const names = ['jabon 750', 'shampoo 750 ml', 'lavaloza', 'paños amarillos', 'esponja amarilla', 'limpiapisos diluido'];
  for (const n of names) {
    const items = await StockItem.find({ name: { \$regex: n, \$options: 'i' } }).lean();
    items.forEach(i => console.log(JSON.stringify({ name: i.name, qtyBodega: i.qtyBodega, enUso: i.enUso, umbral: i.umbralUnidades })));
  }
  await mongoose.disconnect();
});
"
```

Expected: `jabon 750` has `enUso: [{pct: 40}]` (was `pctEnUso: 40`). `lavaloza` (merged) has `qtyBodega: 2` and `enUso: [{pct: 50}]` (the former "cocina" row's %) — confirm no second "lavaloza cocina" row exists anymore. `paños amarillos`/`esponja amarilla` have `qtyBodega` unchanged and whatever `enUso` their prior `pctEnUso` converted to (informational only going forward). `limpiapisos diluido` shows one merged row with both the bodega qty and the en-uso %.

If anything looks wrong, stop — do not proceed to Task 3. Recovery: the backup JSON from Step 2 has the pre-migration state of every document; report the discrepancy and restore from it before re-attempting.

- [ ] **Step 6: Commit**

```bash
cd DASHBOARD-BACKEND-FRAK
git add scripts/backup-stock-2026-07-21.js scripts/migrate-stock-en-uso-2026-07-21.js
git commit -m "data: migrate StockItem to the enUso array model, merge bodega/en-uso row pairs"
```

**Do not push Task 1 or Task 2's commits yet** — wait until Task 3's frontend changes are also ready, so the deploy is coordinated (pushing the backend schema change alone is harmless since old `pctEnUso` reads just become `undefined`/ignored, but the frontend still expects `pctEnUso` until Task 3 lands, so alerts would look wrong in the gap). Get explicit user confirmation before pushing, per this session's established pattern for every production deploy.

---

### Task 3: Frontend alert logic

**Files:**
- Modify: `DASHBOARD-FRONTEND-FRAK/src/utils/stock.js`

**Interfaces:**
- Consumes: `item.enUso: [{ pct: Number }]` (from Task 1/2's backend changes, via `GET /api/data`).
- Produces: `stockStatus(item, isStockZone)` — same signature as before, callers in `StockOverview.jsx`/`ZoneDetail.jsx` are unaffected by this task (Task 4 updates what THEY display, not this function's contract).

- [ ] **Step 1: Replace the alert-status functions**

In `utils/stock.js`, replace:

```js
export function isLowStockConsumible(item) {
  // Reusable items (sponges, cloths) rotate constantly between "new" and
  // "in use" — pctEnUso there tracks wear on whichever one is currently
  // active, not overall supply, so it must never drive the alert. Supply
  // for those is qtyBodega/umbralUnidades alone, same as a fixed asset.
  if (item.reusable) return item.qtyBodega <= item.umbralUnidades;
  return item.qtyBodega <= item.umbralUnidades || (item.pctEnUso != null && item.pctEnUso <= 15);
}
```

with:

```js
const UMBRAL_PCT_CRITICO = 60; // fixed for every product, per the 2026-07-21 design spec

export function isLowStockConsumible(item) {
  return item.qtyBodega <= item.umbralUnidades;
}

// Distinguishes "bajo" (need to restock soon) from "agotado" (about to
// have literally nothing) for consumables. Bodega above the threshold is
// always fine regardless of enUso %. Once bodega hits zero, the one thing
// left is whatever's in enUso — if any active unit is at or below the
// critical %, or there's nothing active either, that's "agotado"; if the
// active unit still has meaningful life left, it's "bajo" (empty bodega,
// but not literally out yet).
function consumibleSeverity(item) {
  if (item.qtyBodega > item.umbralUnidades) return 'ok';
  if (item.qtyBodega === 0) {
    const enUso = item.enUso ?? [];
    const hasCriticalUnit = enUso.length === 0 || enUso.some(u => u.pct <= UMBRAL_PCT_CRITICO);
    return hasCriticalUnit ? 'agotado' : 'bajo';
  }
  return 'bajo';
}
```

- [ ] **Step 2: Update `stockStatus` to use the new severity function**

Find:

```js
export function stockStatus(item, isStockZone) {
  if (isStockZone) {
    if (item.qtyBodega === 0) return 'agotado';
    return isLowStockConsumible(item) ? 'bajo' : 'ok';
  }
  return item.qty === 0 ? 'agotado' : 'ok';
}
```

Replace with:

```js
export function stockStatus(item, isStockZone) {
  if (isStockZone) return consumibleSeverity(item);
  return item.qty === 0 ? 'agotado' : 'ok';
}
```

(`isLowStockConsumible` stays exported — it's still used elsewhere as a simple boolean "is this below threshold at all," e.g. anywhere that just needs true/false rather than the three-way status. Grep the codebase for its call sites before assuming it's unused: `grep -rn "isLowStockConsumible" DASHBOARD-FRONTEND-FRAK/src` — if Step 1/2 leave it with zero remaining callers, that's fine, it's a small pure function and harmless to keep exported for the same "is it below threshold" question other code might reasonably ask later; do not delete it as part of this task.)

- [ ] **Step 3: Manual verification**

Run: `cd DASHBOARD-FRONTEND-FRAK && npm run dev`

Since the backend migration (Task 2) already ran against production, the dev server (pointed at production per `.env`) already serves the new `enUso` shape. In the browser:
1. Open Stock → Casa PAC. Confirm "paños amarillos" and "esponja amarilla" show green ("En Stock") — same as before this task, just now driven by the rewritten logic.
2. Find "jabon 750" (or whichever liquid item has `qtyBodega > umbral` currently) — confirm it shows green regardless of its `enUso` %.
3. Temporarily test the critical case: pick any item, note its current `qtyBodega`, and via a direct script (not the UI) set it to 0 with an `enUso` unit at, say, 30% — confirm the UI now shows "Agotado" (red). Then restore its original `qtyBodega` via the same script before moving on (do not leave test data in production — see the "clean up after live-testing" convention established earlier this session).

- [ ] **Step 4: Commit**

```bash
cd DASHBOARD-FRONTEND-FRAK
git add src/utils/stock.js
git commit -m "feat: two-tier bajo/agotado alert logic using the enUso array"
```

---

### Task 4: Frontend edit form and displays

**Files:**
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/StockModal.jsx`
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/views/ZoneDetail.jsx`
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/views/StockOverview.jsx`

**Interfaces:**
- Consumes: `item.enUso: [{ pct: Number }]`.
- Produces: nothing consumed by other tasks — this is the last task, purely UI.

- [ ] **Step 1: Replace the single "% en uso" field and "reutilizable" checkbox with an editable list**

In `StockModal.jsx`, change `EMPTY` (currently `{ category: '', name: '', qty: '', unit: '', pctEnUso: '', umbral: '1', reusable: false }`) to:

```js
const EMPTY = { category: '', name: '', qty: '', unit: '', umbral: '1', enUso: [] };
```

Update the populate-on-edit `useEffect` — find:

```js
        setForm({
          category: item.category,
          name: item.name,
          qty: String(isStockZone ? item.qtyBodega : item.qty),
          unit: item.unit ?? '',
          pctEnUso: item.pctEnUso == null ? '' : String(item.pctEnUso),
          umbral: String(item.umbralUnidades),
          reusable: item.reusable ?? false,
        });
```

Replace with:

```js
        setForm({
          category: item.category,
          name: item.name,
          qty: String(isStockZone ? item.qtyBodega : item.qty),
          unit: item.unit ?? '',
          umbral: String(item.umbralUnidades),
          enUso: (item.enUso ?? []).map(u => String(u.pct)),
        });
```

Update `validate` — find:

```js
function validate(f, isStockZone) {
  const e = {};
  if (!f.name.trim())     e.name = 'El nombre es requerido';
  if (!f.category.trim()) e.category = 'La categoría es requerida';
  if (f.qty === '')                                    e.qty = 'La cantidad es requerida';
  else if (isNaN(Number(f.qty)) || Number(f.qty) < 0)  e.qty = 'Ingresa un número válido';
  if (isStockZone) {
    if (f.umbral === '')                                     e.umbral = 'El umbral es requerido';
    else if (isNaN(Number(f.umbral)) || Number(f.umbral) < 0) e.umbral = 'Ingresa un número válido';
    if (f.pctEnUso !== '' && (isNaN(Number(f.pctEnUso)) || Number(f.pctEnUso) < 0 || Number(f.pctEnUso) > 100))
      e.pctEnUso = 'Ingresa un valor entre 0 y 100';
  }
  return e;
}
```

Replace with:

```js
function validate(f, isStockZone) {
  const e = {};
  if (!f.name.trim())     e.name = 'El nombre es requerido';
  if (!f.category.trim()) e.category = 'La categoría es requerida';
  if (f.qty === '')                                    e.qty = 'La cantidad es requerida';
  else if (isNaN(Number(f.qty)) || Number(f.qty) < 0)  e.qty = 'Ingresa un número válido';
  if (isStockZone) {
    if (f.umbral === '')                                     e.umbral = 'El umbral es requerido';
    else if (isNaN(Number(f.umbral)) || Number(f.umbral) < 0) e.umbral = 'Ingresa un número válido';
    f.enUso.forEach((pct, i) => {
      if (pct === '' || isNaN(Number(pct)) || Number(pct) < 0 || Number(pct) > 100)
        e[`enUso-${i}`] = 'Ingresa un valor entre 0 y 100';
    });
  }
  return e;
}
```

Update `handleSubmit`'s payload — find:

```js
    const payload = isStockZone
      ? { ...base, unit: form.unit.trim(), qtyBodega: Number(form.qty), pctEnUso: form.pctEnUso === '' ? null : Number(form.pctEnUso), umbralUnidades: Number(form.umbral), reusable: form.reusable }
      : { ...base, qty: Number(form.qty) };
```

Replace with:

```js
    const payload = isStockZone
      ? { ...base, unit: form.unit.trim(), qtyBodega: Number(form.qty), umbralUnidades: Number(form.umbral), enUso: form.enUso.map(pct => ({ pct: Number(pct) })) }
      : { ...base, qty: Number(form.qty) };
```

Replace the checkbox block — find:

```jsx
        {isStockZone && (
          <label className="v-form-row" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.reusable} onChange={e => set('reusable', e.target.checked)} />
            <span>
              <div className="v-form-label" style={{ marginBottom: 2 }}>Ítem reutilizable (esponja, paño…)</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>El % en uso no afectará la alerta de bajo stock — solo la cantidad en bodega.</div>
            </span>
          </label>
        )}
```

with (replaces the old singular "% en uso" input too — find that block right above the checkbox, inside the `v-form-row-split` alongside "Unidad", and remove the `% en uso` half of that split, leaving "Unidad" as a full-width `v-form-row` on its own; then add this new section after it):

```jsx
        {isStockZone && (
          <div className="v-form-row">
            <div className="v-form-label">Unidades en uso (opcional)</div>
            {form.enUso.map((pct, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <input className={'v-input' + (errors[`enUso-${i}`] ? ' v-input-error' : '')}
                  type="number" min="0" max="100" placeholder="ej: 40" value={pct}
                  onChange={e => {
                    const next = [...form.enUso]; next[i] = e.target.value;
                    set('enUso', next);
                  }}
                  style={{ fontFamily: 'var(--font-mono)', textAlign: 'right', maxWidth: 120 }} />
                <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>% restante</span>
                <button className="v-btn ghost" style={{ padding: '4px 8px', marginLeft: 'auto' }}
                  onClick={() => set('enUso', form.enUso.filter((_, j) => j !== i))}>
                  <Icon name="trash" size={12} />
                </button>
                {errors[`enUso-${i}`] && <div className="v-form-error">{errors[`enUso-${i}`]}</div>}
              </div>
            ))}
            <button className="v-btn ghost" style={{ marginTop: form.enUso.length ? 4 : 0 }}
              onClick={() => set('enUso', [...form.enUso, ''])}>
              <Icon name="plus" size={12} /> Agregar unidad en uso
            </button>
          </div>
        )}
```

Locate the existing "Unidad" / "% en uso" split row to remove the old pct half — find:

```jsx
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
```

Replace with:

```jsx
        {isStockZone && (
          <div className="v-form-row">
            <div className="v-form-label">Unidad</div>
            <input className="v-input" placeholder="ej: 750ml, rollo, litro…"
              value={form.unit} onChange={e => set('unit', e.target.value)} />
          </div>
        )}
```

(This removes the old split row entirely — "Unidad" becomes its own full-width row, and the new "Unidades en uso" block from above goes right after it, replacing both the deleted `% en uso` input and the deleted checkbox in one coherent section.)

- [ ] **Step 2: Update `ZoneDetail.jsx`'s row display**

Find:

```jsx
                    {isStockZone && item.pctEnUso != null && (
                      <div className="v-stock-meta">Envase abierto: {item.pctEnUso}% en uso</div>
                    )}
```

Replace with:

```jsx
                    {isStockZone && item.enUso?.length > 0 && (
                      <div className="v-stock-meta">
                        {item.enUso.length === 1
                          ? `Envase abierto: ${item.enUso[0].pct}% en uso`
                          : `En uso: ${item.enUso.map(u => `${u.pct}%`).join(', ')}`}
                      </div>
                    )}
```

- [ ] **Step 3: Update `StockOverview.jsx`'s KPI hover popover**

Find:

```jsx
                <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                  {item.qtyBodega} en bodega
                  {item.pctEnUso != null ? ` · ${item.pctEnUso}% en uso` : ''}
                </div>
```

Replace with:

```jsx
                <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                  {item.qtyBodega} en bodega
                  {item.enUso?.length > 0 ? ` · ${item.enUso.map(u => `${u.pct}%`).join(', ')} en uso` : ''}
                </div>
```

- [ ] **Step 4: Manual verification**

Run: `cd DASHBOARD-FRONTEND-FRAK && npm run dev` (skip if already running from Task 3)

In the browser:
1. Open Stock → Casa PAC → edit "jabon 750". Confirm the form shows "Unidades en uso" with one row pre-filled at its current %, no checkbox, no old singular "% en uso" field.
2. Click "+ Agregar unidad en uso", add a second row, save. Reopen the item — confirm both % values persisted.
3. Remove one via the trash icon, save. Confirm it's gone on reopen.
4. Check the row list (`ZoneDetail`) — confirm the "% en uso" summary text under the product name matches what's actually stored (single value or comma-joined list).
5. Hover a "Por agotar"/"Agotados" KPI on `StockOverview` — confirm the popover's per-item line shows the en-uso %(s) correctly, not `undefined` or blank.

- [ ] **Step 5: Commit**

```bash
cd DASHBOARD-FRONTEND-FRAK
git add src/components/StockModal.jsx src/components/views/ZoneDetail.jsx src/components/views/StockOverview.jsx
git commit -m "feat: edit and display multiple en-uso units per stock item"
```

---

## Deploy

Push Task 1+2's backend commits together (schema + migration script — the migration itself already ran locally against production in Task 2/Step 4, so this push is just landing the code that matches what's already in the database), then push Task 3+4's frontend commits. **Confirm with the user before each push**, per this session's established pattern — these are live production deploys for a dashboard real people are actively using.

## Self-review notes

- **Spec coverage:** data model (Task 1), migration with mandatory backup (Task 2), alert logic (Task 3), edit UI + all two display sites that read `pctEnUso` (Task 4) — grepped for `pctEnUso` across `ZoneDetail.jsx`/`StockOverview.jsx`/`StockModal.jsx`/`utils/stock.js`, all four covered.
- **Safety:** Task 2 is the only step that mutates production data destructively (the merge deletes one row per pair) — gated behind a verified backup (Step 2) and a spot-check against that backup (Step 5) before Task 3 proceeds.
- **Not in this plan:** a per-item `umbralPctCritico` field — explicitly out of scope per the design spec.
