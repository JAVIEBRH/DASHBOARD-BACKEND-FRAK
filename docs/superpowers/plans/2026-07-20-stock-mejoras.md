# Stock — Edición visible + vista rápida de alertas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing "edit minimum threshold" feature more discoverable, and add a hover popover on the Stock KPI numbers (Total/Por agotar/Agotados) that shows the actual item list without navigating away.

**Architecture:** Two independent, additive frontend-only changes (no backend/schema changes — the edit flow and status logic already exist and are correct). No new dependencies.

**Tech Stack:** React (frontend, `DASHBOARD-FRONTEND-FRAK`). No test runner in this repo (established convention) — verification is manual, in a running dev server against the production backend.

## Global Constraints

- Never delete or overwrite existing stock/furniture data.
- Do not change `stockStatus`, `zoneStats`, or `isLowStockConsumible` in `src/utils/stock.js` — their logic is already correct (verified by reading the code); reuse them, don't reimplement.
- Do not add a test runner — this repo has none by convention.

## Confirmed findings (do not re-investigate)

- **"Diego no revisó el editar" (#8) is not a bug.** The edit flow for `umbralUnidades` (alert threshold) is fully implemented end-to-end: `StockModal.jsx:109-115` has the "Umbral de alerta" input, `Stock.jsx:43` wires it to `editStockItem`, and the backend (`api/stock/[id].js`) persists it via a plain `findOneAndUpdate`. The only real gap is discoverability: in `ZoneDetail.jsx:99-103`, the edit button is a bare icon-only ghost button (`<Icon name="edit" size={13} />`, no label) at the far right of a dense table row — easy to miss. Task 1 below only touches this button's visibility, not the underlying save logic.
- **No existing cross-zone "agotados only" view (#9).** `StockOverview.jsx`'s KPI cells (`v-kpi-cell`, lines 27-41) render numbers with no `onClick`/hover behavior at all. `AirbnbResumen.jsx`'s stock alert links all call `setView('stock')` with no filter state — they only ever land on the generic property/zone picker. The user confirmed the desired behavior is a **hover popover directly on the KPI numbers in `StockOverview.jsx`** (not a click-through to a new page, and not `AirbnbResumen.jsx` — that view's cross-property KPIs are out of scope for this plan; only the per-property `StockOverview` KPIs need the hover).
- `utils/stock.js` already exports everything needed to build the item lists: `stockStatus(item, isStockZone)` returns `'agotado' | 'bajo' | 'ok'`, and `StockOverview` already receives the full `stock` array (all consumables for the property, across all zones) as a prop.

---

### Task 1: Make the stock item edit button visible/labeled

**Files:**
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/views/ZoneDetail.jsx`

**Interfaces:**
- Consumes: nothing new — `onEdit` prop already exists and already works.
- Produces: nothing consumed by other tasks — self-contained UI change.

- [ ] **Step 1: Replace the icon-only edit button with an icon+label button**

In `ZoneDetail.jsx`, find this block (around line 99-103):

```jsx
                  <div style={{ textAlign: 'right' }}>
                    <button className="v-btn ghost" style={{ padding: 6 }} onClick={() => onEdit(item)}>
                      <Icon name="edit" size={13} />
                    </button>
                  </div>
```

Replace with:

```jsx
                  <div style={{ textAlign: 'right' }}>
                    <button className="v-btn ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => onEdit(item)}>
                      <Icon name="edit" size={13} /> Editar
                    </button>
                  </div>
```

This is the only change in this file for this task — the row's grid layout (`v-stock-row`, `grid-template-columns: 1fr 140px 90px 140px 48px` in `index.css:943`) already reserves a fixed 48px column for this cell; a short "Editar" label fits within it visually widening only slightly since it's `text-align: right` and the button is inline — confirm this looks right in Step 2, and if the label visually clips, widen the column (see Step 2's note).

- [ ] **Step 2: Manual verification**

Run: `cd DASHBOARD-FRONTEND-FRAK && npm run dev`

In the browser:
1. Open Stock → Casa PAC → the "Stock" zone (or any zone with consumables).
2. Confirm each row now shows an "Editar" button with a pencil icon, not just a bare icon — visually distinct enough that it reads as clickable/actionable at a glance.
3. If the "Editar" text visually clips or overlaps the row's status column (the grid's last column is only 48px, per `index.css:943`), widen it: change `grid-template-columns: 1fr 140px 90px 140px 48px;` to `grid-template-columns: 1fr 140px 90px 140px 76px;` in **both** `.v-stock-row-head` and `.v-stock-row` selectors (`index.css:940-947`) — keep them identical, they must stay in sync since the header and rows are separate grids that need matching columns to align.
4. Click "Editar" on a real item, change "Umbral de alerta" to a different number, save, and confirm the row's `mín. X` value (already shown at `ZoneDetail.jsx:93`) updates to match.

- [ ] **Step 3: Commit**

```bash
cd DASHBOARD-FRONTEND-FRAK
git add src/components/views/ZoneDetail.jsx src/index.css
git commit -m "fix: make the stock item edit button visible instead of icon-only"
```

(Only include `src/index.css` in the `git add` if Step 2.3's column-width change was needed.)

---

### Task 2: Hover popover on Stock KPI numbers

**Files:**
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/views/StockOverview.jsx`
- Modify: `DASHBOARD-FRONTEND-FRAK/src/index.css`

**Interfaces:**
- Consumes: `stockStatus` and `STATUS_META`/`statusMeta` from `../../utils/stock.js` (already imported in this file).
- Produces: nothing consumed by other tasks — self-contained UI addition.

- [ ] **Step 1: Compute the three item lists behind the KPIs**

In `StockOverview.jsx`, the component already computes `stockStats`, `porAgotar`, `agotados` from `zoneStats(stock, true)` (lines 9-11). Add the actual item lists right after those lines:

```js
  const stockStats = zoneStats(stock, true);
  const porAgotar = stockStats.bajoStock;
  const agotados = stockStats.agotados;

  const porAgotarItems = stock.filter(i => stockStatus(i, true) === 'bajo');
  const agotadosItems  = stock.filter(i => stockStatus(i, true) === 'agotado');
```

Add `stockStatus` to the existing import at the top of the file (line 3 currently reads `import { zoneStats, statusMeta } from '../../utils/stock.js';`):

```js
import { zoneStats, statusMeta, stockStatus } from '../../utils/stock.js';
```

- [ ] **Step 2: Build a small reusable hover-popover wrapper**

Add this component at the bottom of `StockOverview.jsx`, after the closing brace of the `StockOverview` function (it's small and only used here, so it doesn't need its own file — if it later gets reused elsewhere, split it out then, not now):

```jsx
function KpiHoverList({ items, emptyLabel }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: 'relative', height: '100%' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 20,
          minWidth: 220, maxWidth: 300, maxHeight: 260, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 10,
          boxShadow: 'var(--shadow-md)', padding: '10px 12px',
        }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{emptyLabel}</div>
          ) : (
            items.map(item => (
              <div key={item.id} style={{ padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid var(--line)' }}>
                <div style={{ color: 'var(--ink)' }}>{item.name}</div>
                <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                  {item.category} · {item.qtyBodega} en bodega
                  {item.pctEnUso != null ? ` · ${item.pctEnUso}% en uso` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

Add `useState` to the React import at the top of the file. Currently `StockOverview.jsx` has no React import line at all (it only imports `Icon` and the stock utils) — add this as a new top import:

```js
import { useState } from 'react';
```

- [ ] **Step 3: Wrap the "Por agotar" and "Agotados" KPI cells with the hover popover**

Find the KPI hero block (lines 26-42):

```jsx
      <div className="v-kpi-hero">
        <div className="v-kpi-cell primary">
          <div className="v-kpi-label">Total productos</div>
          <div className="v-kpi-value">{totalProductos}</div>
          <div className="v-kpi-sub">En {zones.length} zonas</div>
        </div>
        <div className="v-kpi-cell">
          <div className="v-kpi-label">Por agotar</div>
          <div className="v-kpi-value" style={{ color: 'var(--jat)' }}>{porAgotar}</div>
          <div className="v-kpi-sub">Consumibles bajo el umbral de alerta</div>
        </div>
        <div className="v-kpi-cell">
          <div className="v-kpi-label">Agotados</div>
          <div className="v-kpi-value neg">{agotados}</div>
          <div className="v-kpi-sub">Consumibles sin unidades disponibles</div>
        </div>
      </div>
```

Replace with (wrapping only "Por agotar" and "Agotados" — the user's request was specifically about those two, and "Total productos" isn't a single filterable item list the same way, so leave it as-is per YAGNI):

```jsx
      <div className="v-kpi-hero">
        <div className="v-kpi-cell primary">
          <div className="v-kpi-label">Total productos</div>
          <div className="v-kpi-value">{totalProductos}</div>
          <div className="v-kpi-sub">En {zones.length} zonas</div>
        </div>
        <KpiHoverList items={porAgotarItems} emptyLabel="Nada por agotar.">
          <div className="v-kpi-cell" style={{ cursor: 'default' }}>
            <div className="v-kpi-label">Por agotar</div>
            <div className="v-kpi-value" style={{ color: 'var(--jat)' }}>{porAgotar}</div>
            <div className="v-kpi-sub">Consumibles bajo el umbral de alerta</div>
          </div>
        </KpiHoverList>
        <KpiHoverList items={agotadosItems} emptyLabel="Nada agotado.">
          <div className="v-kpi-cell">
            <div className="v-kpi-label">Agotados</div>
            <div className="v-kpi-value neg">{agotados}</div>
            <div className="v-kpi-sub">Consumibles sin unidades disponibles</div>
          </div>
        </KpiHoverList>
      </div>
```

This changes `KpiHoverList` from wrapping just an item array to also taking `children` (the KPI cell markup) so the hover boundary covers the whole cell. Update the `KpiHoverList` signature from Step 2 to accept and render `children`:

```jsx
function KpiHoverList({ items, emptyLabel, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{ position: 'relative', height: '100%' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 8, zIndex: 20,
          minWidth: 220, maxWidth: 300, maxHeight: 260, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 10,
          boxShadow: 'var(--shadow-md)', padding: '10px 12px',
        }}>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{emptyLabel}</div>
          ) : (
            items.map(item => (
              <div key={item.id} style={{ padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid var(--line)' }}>
                <div style={{ color: 'var(--ink)' }}>{item.name}</div>
                <div style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                  {item.category} · {item.qtyBodega} en bodega
                  {item.pctEnUso != null ? ` · ${item.pctEnUso}% en uso` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

(This replaces the version written in Step 2 — write it directly in this final form; Step 2 is described separately only to explain the piece being built before wiring it in.)

- [ ] **Step 4: Manual verification**

Run: `cd DASHBOARD-FRONTEND-FRAK && npm run dev` (skip if already running from Task 1)

In the browser:
1. Open Stock → Casa PAC (a property with real agotados/bajo items, per the "26 agotados · 16 por agotar" seen earlier for this property).
2. Hover the mouse over the "Por agotar" KPI cell (don't click) — confirm a popover appears below it listing the actual bajo-stock items by name, category, and quantity, without navigating away from the page.
3. Move the mouse off — confirm the popover disappears.
4. Repeat for "Agotados".
5. Hover "Total productos" — confirm nothing happens (out of scope, unchanged).
6. Switch to Dpto. San Miguel (currently 0 stock alerts, per earlier session data) and hover "Por agotar"/"Agotados" there — confirm the popover shows the `emptyLabel` text instead of an empty box.

- [ ] **Step 5: Commit**

```bash
cd DASHBOARD-FRONTEND-FRAK
git add src/components/views/StockOverview.jsx
git commit -m "feat: hover popover on Stock KPIs showing agotados/por-agotar item lists"
```

---

## Self-review notes

- **Spec coverage:** #8 (edit discoverability) → Task 1. #9 (hover quick-view on agotados/por-agotar KPIs) → Task 2, scoped exactly to the user's clarified request (hover, not click-through; `StockOverview.jsx`'s per-property KPIs, not `AirbnbResumen.jsx`'s cross-property ones).
- **Not in this plan:** any change to `AirbnbResumen.jsx`'s stock alert links/counts — the user's answer scoped #9 to the Stock section's own KPIs specifically ("los kpis superiores del apartado de STOCK"), so `AirbnbResumen.jsx` is untouched.
