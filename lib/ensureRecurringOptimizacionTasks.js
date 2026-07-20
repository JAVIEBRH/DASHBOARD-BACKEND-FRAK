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
