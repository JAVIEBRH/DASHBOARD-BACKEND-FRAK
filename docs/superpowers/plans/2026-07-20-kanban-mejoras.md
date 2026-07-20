# Kanban — Propiedad en wizard, pulido UX, recordatorios recurrentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which property a Kanban task belongs to inside the task wizard, visually polish the board so it reads as a finished to-do tool, and add the recurring "Optimización Airbnb" reminder card per the approved design spec.

**Architecture:** Three tasks of increasing scope: a one-line prop addition (Task 1), a frontend-only visual polish pass on an existing component (Task 2), and a backend-driven recurring-task generator plus the schema/endpoint changes it needs (Task 3, the largest — implements `docs/superpowers/specs/2026-07-20-kanban-optimizacion-recurrente-design.md`).

**Tech Stack:** React (frontend, `DASHBOARD-FRONTEND-FRAK`), Vercel serverless + Mongoose (backend, `DASHBOARD-BACKEND-FRAK`). No test runner in either repo (established convention) — verification is manual.

## Global Constraints

- Never delete or overwrite existing kanban/limpieza data.
- New `KanbanTask` fields (`recurring`, `doneAt`) must be optional/default-safe — existing tasks must keep working unchanged, exactly like the `guestCount` precedent on `Estadia`.
- Do not touch `api/airbnb.js`'s routing structure (resource/id query-param pattern) — only add logic inside the existing PUT branch for `resource=kanban`.
- Do not add a settings UI for the 7-day interval — it's a code constant per the approved spec (`docs/superpowers/specs/2026-07-20-kanban-optimizacion-recurrente-design.md`, "Fuera de alcance").
- Read the full design spec (`docs/superpowers/specs/2026-07-20-kanban-optimizacion-recurrente-design.md`) before starting Task 3 — this plan's Task 3 implements it, but the spec has the full rationale.

## Confirmed findings (do not re-investigate)

- `KanbanTaskModal.jsx` currently shows zero property information anywhere — header is just `"Airbnb · Kanban"` / `"Editar tarea"`/`"Nueva tarea"` (`KanbanTaskModal.jsx:33-35`). The `property` value is only attached by the parent (`AirbnbKanban.jsx:142`) after save — the modal itself never sees it.
- `AirbnbKanban.jsx` already shows per-column item counts (`AirbnbKanban.jsx:103`) and already distinguishes limpieza cards with a border color + sparkle icon (`AirbnbKanban.jsx:109,112`) — the user's complaint ("pensó que no estaba terminada") is about visual polish, not missing functionality. The user's own diagnosis: emphasize the "TO DO" framing, animate more, make the column-transition arrows more prominent.
- Existing CSS keyframes available to reuse (`index.css`): `v-row-in` (slide-in from left, used by `.v-stock-row`), `v-card-in` (fade+rise, used by `.v-card`), `v-pop` (scale+fade, used by modals). No new keyframes needed.
- Existing icons available (`src/components/ui/Icon.jsx`): `edit`, `chevron_right`, `chevron_down`, `sparkle`, `columns`, `bell` — the move-arrows already use `chevron_right` (rotated for "left").

---

### Task 1: Show the property name in the Kanban task wizard

**Files:**
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/KanbanTaskModal.jsx`
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/views/AirbnbKanban.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KanbanTaskModal` gains a new required-in-practice prop `propertyName: string` — any future caller of this modal must pass it.

- [ ] **Step 1: Add a `propertyName` prop to `KanbanTaskModal` and render it**

In `KanbanTaskModal.jsx`, change the function signature (line 7):

```js
export function KanbanTaskModal({ open, item, onSave, onDelete, onClose }) {
```

to:

```js
export function KanbanTaskModal({ open, item, propertyName, onSave, onDelete, onClose }) {
```

Then find the modal header block (lines 32-42):

```jsx
        <div className="v-modal-head">
          <div>
            <div className="v-modal-eyebrow">Airbnb · Kanban</div>
            <div className="v-modal-title">{isEdit ? 'Editar tarea' : 'Nueva tarea'}</div>
          </div>
```

Replace the eyebrow line with:

```jsx
        <div className="v-modal-head">
          <div>
            <div className="v-modal-eyebrow">Airbnb · Kanban · {propertyName}</div>
            <div className="v-modal-title">{isEdit ? 'Editar tarea' : 'Nueva tarea'}</div>
          </div>
```

- [ ] **Step 2: Pass the property name from `AirbnbKanban.jsx`**

Find where `KanbanTaskModal` is rendered (`AirbnbKanban.jsx:137-153`):

```jsx
      <KanbanTaskModal
        open={modalTask !== undefined}
        item={modalTask ?? null}
        onClose={() => setModalTask(undefined)}
```

Add `propertyName={property.name}` (the `property` variable already exists in this component, computed at line 26 — `property` is guaranteed non-null at this point in the render since the component returns early at line 60 when `!property`):

```jsx
      <KanbanTaskModal
        open={modalTask !== undefined}
        item={modalTask ?? null}
        propertyName={property.name}
        onClose={() => setModalTask(undefined)}
```

- [ ] **Step 3: Manual verification**

Run: `cd DASHBOARD-FRONTEND-FRAK && npm run dev`

In the browser: open Kanban → Casa PAC → "Nueva tarea". Confirm the modal's eyebrow reads "Airbnb · Kanban · Casa PAC". Switch to Dpto. San Miguel and repeat — confirm it reads "Airbnb · Kanban · Dpto. San miguel".

- [ ] **Step 4: Commit**

```bash
cd DASHBOARD-FRONTEND-FRAK
git add src/components/KanbanTaskModal.jsx src/components/views/AirbnbKanban.jsx
git commit -m "feat: show property name in the Kanban task wizard"
```

---

### Task 2: Visual polish on the Kanban board

**Files:**
- Modify: `DASHBOARD-FRONTEND-FRAK/src/components/views/AirbnbKanban.jsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by other tasks — self-contained visual change. Safe to do independently of Task 1 and Task 3 (touches the same file as Task 1 but a different region — do Task 1 first to avoid a merge conflict on the same file).

- [ ] **Step 1: Animate cards into place when they move between columns**

Find the card wrapper (`AirbnbKanban.jsx:106-110`):

```jsx
                {colItems.map(item => (
                  <div key={item.kind + item.id} className="v-card" style={{
                    padding: 10, background: 'var(--surface-2)',
                    borderColor: item.kind === 'limpieza' ? 'var(--brass-2)' : undefined,
                  }}>
```

Replace with (adds the existing `v-row-in` slide-in animation — since the card genuinely unmounts from its old column and mounts fresh in its new one when `status` changes, this animation replays every time a card moves, giving visible feedback without any new state or key trickery):

```jsx
                {colItems.map(item => (
                  <div key={item.kind + item.id} className="v-card" style={{
                    padding: 10, background: 'var(--surface-2)',
                    borderColor: item.kind === 'limpieza' ? 'var(--brass-2)' : undefined,
                    animation: 'v-row-in 0.25s cubic-bezier(.2,.8,.2,1) both',
                  }}>
```

- [ ] **Step 2: Make the move-between-columns arrows more prominent**

Find the two move buttons (`AirbnbKanban.jsx:116-125`):

```jsx
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="v-btn ghost" disabled={colIdx === 0} style={{ padding: '3px 7px', fontSize: 11, opacity: colIdx === 0 ? 0.3 : 1 }}
                        onClick={() => move(item, -1)}>
                        <Icon name="chevron_right" size={11} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                      <button className="v-btn ghost" disabled={colIdx === COLUMNS.length - 1} style={{ padding: '3px 7px', fontSize: 11, opacity: colIdx === COLUMNS.length - 1 ? 0.3 : 1 }}
                        onClick={() => move(item, 1)}>
                        <Icon name="chevron_right" size={11} />
                      </button>
                    </div>
```

Replace with (bigger tap targets, a visible border so they read as buttons rather than faint glyphs, and a title tooltip naming the action):

```jsx
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button className="v-btn" disabled={colIdx === 0}
                        title={colIdx > 0 ? `Mover a "${COLUMNS[colIdx - 1].label}"` : undefined}
                        style={{ padding: '5px 9px', fontSize: 11, opacity: colIdx === 0 ? 0.3 : 1 }}
                        onClick={() => move(item, -1)}>
                        <Icon name="chevron_right" size={13} style={{ transform: 'rotate(180deg)' }} />
                      </button>
                      <button className="v-btn" disabled={colIdx === COLUMNS.length - 1}
                        title={colIdx < COLUMNS.length - 1 ? `Mover a "${COLUMNS[colIdx + 1].label}"` : undefined}
                        style={{ padding: '5px 9px', fontSize: 11, opacity: colIdx === COLUMNS.length - 1 ? 0.3 : 1 }}
                        onClick={() => move(item, 1)}>
                        <Icon name="chevron_right" size={13} />
                      </button>
                    </div>
```

(Changed `className="v-btn ghost"` to `className="v-btn"` — the solid/bordered `v-btn` style is more visible than `ghost`, and increased icon size from 11 to 13 and padding from `3px 7px` to `5px 9px`.)

- [ ] **Step 3: Add a small "Tarea"/"Limpieza" tag so the two card kinds read as intentionally different, not inconsistently styled**

Find the card title row (`AirbnbKanban.jsx:111-114`):

```jsx
                    <div onClick={() => openItem(item)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, marginBottom: item.notes ? 4 : 0 }}>
                      {item.kind === 'limpieza' && <Icon name="sparkle" size={12} color="var(--brass-2)" />}
                      {item.title}
                    </div>
```

Replace with (adds a small uppercase kind label above the title, consistent with the mono-uppercase style already used for column headers at `AirbnbKanban.jsx:100`):

```jsx
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: item.kind === 'limpieza' ? 'var(--brass-2)' : 'var(--ink-4)', marginBottom: 3 }}>
                      {item.kind === 'limpieza' ? 'Limpieza' : 'Tarea'}
                    </div>
                    <div onClick={() => openItem(item)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, marginBottom: item.notes ? 4 : 0 }}>
                      {item.kind === 'limpieza' && <Icon name="sparkle" size={12} color="var(--brass-2)" />}
                      {item.title}
                    </div>
```

- [ ] **Step 4: Give the empty "Sin tareas" column state a lighter, more intentional look**

Find the empty state (`AirbnbKanban.jsx:128-130`):

```jsx
                {colItems.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-4)', padding: '12px 0', textAlign: 'center' }}>Sin tareas</div>
                )}
```

Replace with (a dashed placeholder box instead of bare centered text — reads as "this is an empty container" rather than "something is missing/broken", the same visual language `AddPropertyModal`-style dashed-add-cards already use elsewhere in this codebase, e.g. `PropertySelector.jsx`'s `.v-property-card.add`):

```jsx
                {colItems.length === 0 && (
                  <div style={{
                    fontSize: 12, color: 'var(--ink-4)', padding: '20px 0', textAlign: 'center',
                    border: '1px dashed var(--line-2)', borderRadius: 8,
                  }}>Sin tareas</div>
                )}
```

- [ ] **Step 5: Manual verification**

Run: `cd DASHBOARD-FRONTEND-FRAK && npm run dev` (skip if already running)

In the browser: open Kanban for a property with at least one task in each column (or move one manually to populate all three).
1. Confirm each card shows a small "Tarea" or "Limpieza" label above its title.
2. Confirm the move arrows are visibly bigger/bordered, and hovering shows a native tooltip naming the target column.
3. Click a move arrow — confirm the card visibly slides in when it lands in the new column (not an instant jump).
4. Confirm an empty column shows a dashed-border placeholder box, not bare floating text.

- [ ] **Step 6: Commit**

```bash
cd DASHBOARD-FRONTEND-FRAK
git add src/components/views/AirbnbKanban.jsx
git commit -m "polish: clearer kanban cards, bigger move arrows, dashed empty-column state"
```

---

### Task 3: Recurring "Optimización Airbnb" reminder cards

Implements `docs/superpowers/specs/2026-07-20-kanban-optimizacion-recurrente-design.md` — read that file first for full rationale. This task is split into backend (Steps 1-4) and frontend verification (Step 5, no frontend code changes are needed — the recurring cards render through the existing Kanban UI with no special-casing).

**Files:**
- Modify: `DASHBOARD-BACKEND-FRAK/lib/models/KanbanTask.js`
- Modify: `DASHBOARD-BACKEND-FRAK/lib/buildDiegoData.js`
- Modify: `DASHBOARD-BACKEND-FRAK/api/airbnb.js`
- Create: `DASHBOARD-BACKEND-FRAK/lib/ensureRecurringOptimizacionTasks.js`
- Modify: `DASHBOARD-BACKEND-FRAK/api/data.js`

**Interfaces:**
- Consumes: `Property` model (`id`, `name` fields, already defined in `lib/models/Property.js`), `KanbanTask` model (extended by Step 1).
- Produces: `ensureRecurringOptimizacionTasks(properties, existingTasks)` — an async function returning `Promise<KanbanTaskDoc[]>` (the newly-created task documents, if any; empty array if none were due). Any future caller only needs this one function and its two positional args.

- [ ] **Step 1: Extend the `KanbanTask` schema**

In `lib/models/KanbanTask.js`, change:

```js
const schema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  title:    { type: String, required: true },
  status:   { type: String, enum: ['todo', 'doing', 'done'], default: 'todo' },
  property: { type: String, default: 'pac' },
  notes:    String,
});
```

to:

```js
const schema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  title:     { type: String, required: true },
  status:    { type: String, enum: ['todo', 'doing', 'done'], default: 'todo' },
  property:  { type: String, default: 'pac' },
  notes:     String,
  recurring: { type: Boolean, default: false },
  doneAt:    { type: Date, default: null },
}, { timestamps: true });
```

- [ ] **Step 2: Set/clear `doneAt` when a task's status changes**

In `api/airbnb.js`, find the PUT handler (currently):

```js
  if (req.method === 'PUT' && id) {
    const result = await Model.findOneAndUpdate({ id }, req.body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }
```

Replace with:

```js
  if (req.method === 'PUT' && id) {
    const body = { ...req.body };
    if (resource === 'kanban' && 'status' in body) {
      body.doneAt = body.status === 'done' ? new Date() : null;
    }
    const result = await Model.findOneAndUpdate({ id }, body, { new: true });
    if (!result) return res.status(404).json({ ok: false, error: 'not found' });
    return res.json({ ok: true });
  }
```

This only touches `doneAt` for the `kanban` resource, and only when the update actually includes a `status` change (the modal's "save notes" edits, which don't touch `status`, leave `doneAt` untouched) — `estadias` and `limpiezas` PUT requests are unaffected since `resource !== 'kanban'` for those.

- [ ] **Step 3: Write the recurring-task generator**

Create `lib/ensureRecurringOptimizacionTasks.js`:

```js
// lib/ensureRecurringOptimizacionTasks.js
import KanbanTask from './models/KanbanTask.js';

const INTERVALO_DIAS = 7;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function checklistNotes() {
  return 'Revisar: cambiar imagen de portada · actualizar descripción (con variantes de texto) · revisar precio.';
}

// Checks each property's most recent recurring "Optimización Airbnb" card and,
// per the design spec (docs/superpowers/specs/2026-07-20-kanban-optimizacion-recurrente-design.md),
// creates a new one when: (a) the property has never had one, or (b) the most
// recent one is done and at least INTERVALO_DIAS have passed since it was
// closed. Never creates a second one while one is still open, to avoid
// duplicates piling up.
export async function ensureRecurringOptimizacionTasks(properties, existingTasks) {
  const created = [];

  for (const property of properties) {
    const propertyRecurringTasks = existingTasks
      .filter(t => t.property === property.id && t.recurring)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const latest = propertyRecurringTasks[0];

    let shouldCreate = false;
    if (!latest) {
      shouldCreate = true;
    } else if (latest.status === 'done' && latest.doneAt) {
      const daysSinceDone = (Date.now() - new Date(latest.doneAt).getTime()) / MS_POR_DIA;
      shouldCreate = daysSinceDone >= INTERVALO_DIAS;
    }
    // else: latest exists and is not done (still open) — never create a duplicate.

    if (shouldCreate) {
      const doc = await KanbanTask.create({
        id: `kanban-recurring-${property.id}-${Date.now()}`,
        title: `Optimización Airbnb — ${property.name}`,
        status: 'todo',
        property: property.id,
        notes: checklistNotes(),
        recurring: true,
      });
      created.push(doc);
    }
  }

  return created;
}
```

- [ ] **Step 4: Wire it into `GET /api/data`**

In `api/data.js`, find:

```js
  const estadias = await Estadia.find({}).lean();
  const limpiezas = await Limpieza.find({}).lean();
  const kanbanTasks = await KanbanTask.find({}).lean();
  res.json(buildDiegoData(txs, stock, furniture, stockProperties, estadias, limpiezas, kanbanTasks));
```

Replace with:

```js
  const estadias = await Estadia.find({}).lean();
  const limpiezas = await Limpieza.find({}).lean();
  let kanbanTasks = await KanbanTask.find({}).lean();

  const newlyCreated = await ensureRecurringOptimizacionTasks(stockProperties, kanbanTasks);
  if (newlyCreated.length > 0) {
    kanbanTasks = [...kanbanTasks, ...newlyCreated.map(doc => doc.toObject())];
  }

  res.json(buildDiegoData(txs, stock, furniture, stockProperties, estadias, limpiezas, kanbanTasks));
```

Add the import at the top of `api/data.js`, alongside the other `lib/` imports:

```js
import { ensureRecurringOptimizacionTasks } from '../lib/ensureRecurringOptimizacionTasks.js';
```

- [ ] **Step 5: Thread `recurring`/`doneAt` through `buildDiegoData`**

In `lib/buildDiegoData.js`, find:

```js
    kanbanTasks: kanbanTasks.map(k => ({
      id: k.id, title: k.title, status: k.status, property: k.property, notes: k.notes,
    })),
```

Replace with:

```js
    kanbanTasks: kanbanTasks.map(k => ({
      id: k.id, title: k.title, status: k.status, property: k.property, notes: k.notes,
      recurring: k.recurring, doneAt: k.doneAt,
    })),
```

- [ ] **Step 6: Manual verification — bootstrap case (property with zero recurring tasks)**

This requires manipulating real data in MongoDB directly to simulate time passing, since there's no test runner. Run these against the production database (same `.env`/`MONGODB_URI` used throughout this project):

```bash
cd DASHBOARD-BACKEND-FRAK
node --env-file=.env -e "
import('mongoose').then(async (m) => {
  const mongoose = m.default;
  await mongoose.connect(process.env.MONGODB_URI);
  const KanbanTask = (await import('./lib/models/KanbanTask.js')).default;
  const before = await KanbanTask.countDocuments({ recurring: true });
  console.log('recurring tasks before:', before);
  await mongoose.disconnect();
});
"
```

Then hit the production API to trigger the check-on-load logic (this requires the Step 1-5 changes to be deployed first — push to `main` and wait for the Vercel deploy to go `READY`, same process as the earlier `guestCount` deploy in this session):

```bash
curl -s https://dashboard-backend-frak.vercel.app/api/data | node -e "
let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const json = JSON.parse(data);
  const recurring = json.kanbanTasks.filter(t => t.recurring);
  console.log('recurring tasks after hitting the API:', recurring.length);
  console.log(recurring.map(t => ({ title: t.title, property: t.property, status: t.status })));
});
"
```

Expected: one new recurring task per property that had none before (Casa PAC, Dpto. San Miguel), titled `"Optimización Airbnb — Casa PAC"` / `"Optimización Airbnb — Dpto. San miguel"`, both `status: 'todo'`.

- [ ] **Step 7: Manual verification — no duplicate while open**

Hit `GET /api/data` again immediately (same curl command as Step 6):

```bash
curl -s https://dashboard-backend-frak.vercel.app/api/data | node -e "
let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const json = JSON.parse(data);
  console.log('recurring tasks count:', json.kanbanTasks.filter(t => t.recurring).length);
});
"
```

Expected: the same count as Step 6's end state — no new task created while the existing ones are still `status: 'todo'`.

- [ ] **Step 8: Manual verification — new cycle after 7+ days closed**

Directly mark one property's recurring task done with a `doneAt` more than 7 days in the past (simulating that it was closed over a week ago), then confirm the next `GET /api/data` call creates a fresh one:

```bash
cd DASHBOARD-BACKEND-FRAK
node --env-file=.env -e "
import('mongoose').then(async (m) => {
  const mongoose = m.default;
  await mongoose.connect(process.env.MONGODB_URI);
  const KanbanTask = (await import('./lib/models/KanbanTask.js')).default;
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const result = await KanbanTask.findOneAndUpdate(
    { property: 'pac', recurring: true },
    { status: 'done', doneAt: eightDaysAgo },
    { sort: { createdAt: -1 }, new: true }
  );
  console.log('marked done 8 days ago:', result?.id);
  await mongoose.disconnect();
});
"
```

Then re-run the same curl check from Step 7. Expected: Casa PAC now has **two** recurring tasks total (the one just marked done, plus a brand-new one in `status: 'todo'`) — confirming the 7-day-after-close rule works. Dpto. San Miguel's count should be unchanged (its task is still open from Step 6, so it must not have gained a duplicate).

- [ ] **Step 9: Frontend sanity check**

Open the dashboard in a browser (`npm run dev` in `DASHBOARD-FRONTEND-FRAK`, pointed at production per `.env`), go to Kanban → Casa PAC. Confirm the recurring card appears in "Por hacer" with the title `"Optimización Airbnb — Casa PAC"`, and opening it shows the checklist notes pre-filled. Confirm it behaves like any other card (movable, editable, deletable) — no special UI is expected per the design spec.

- [ ] **Step 10: Commit**

```bash
cd DASHBOARD-BACKEND-FRAK
git add lib/models/KanbanTask.js lib/buildDiegoData.js api/airbnb.js lib/ensureRecurringOptimizacionTasks.js api/data.js
git commit -m "feat: auto-create recurring 'Optimización Airbnb' Kanban card every 7 days per property"
git push
```

Wait for the Vercel deploy to reach `READY` (check via `mcp__plugin_vercel_vercel__list_deployments` or `curl -sI https://dashboard-backend-frak.vercel.app/api/data`) before running Steps 6-9's verification against production.

**Before pushing:** this deploy changes behavior on the live production API that a real business depends on (every dashboard load will now potentially write new Kanban tasks). Confirm with the user before running `git push`, the same way the `guestCount` backend push was confirmed earlier in this session.

---

## Self-review notes

- **Spec coverage:** #11 (property in wizard) → Task 1. #12 (Kanban feels unfinished) → Task 2, scoped to the three concrete symptoms the user named (arrows, animation, "TO DO" framing via card-kind labels and a less bare empty state) — not an open-ended redesign. #13 (recurring reminders) → Task 3, implementing the already-approved design spec exactly (7-day interval, per-property, single combined card, check-on-load, no cron, no price-recommendation, no settings UI).
- **Ordering:** Task 1 and Task 2 both touch `AirbnbKanban.jsx` in different, non-overlapping regions (header eyebrow wiring vs. card/column rendering) — do Task 1 first since it's smaller, to minimize merge friction if both are worked in parallel worktrees; if done sequentially in one worktree, order doesn't matter.
- **Task 3 push gate:** flagged explicitly above — do not push without asking, mirroring the precedent set earlier this session for the `guestCount` backend deploy.
