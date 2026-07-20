# Recordatorio recurrente "Optimización Airbnb" en Kanban — Design

## Contexto y motivación

Diego (dueño) y su colega descubrieron, analizando su publicación de Airbnb con ayuda de IA, que actualizar periódicamente textos, precio o imágenes de la publicación ("ping" al servidor de Airbnb) ayuda a mantenerse mejor posicionado en la búsqueda. Quieren que el dashboard les recuerde hacerlo, integrado al Kanban existente (no un apartado nuevo), para no depender de la memoria.

## Alcance confirmado con el usuario

- **Intervalo:** cada 7 días.
- **Por propiedad:** cada propiedad (Casa PAC, Dpto. San Miguel) tiene su propio ciclo independiente.
- **Mecanismo:** se crea automáticamente una tarjeta nueva en la columna "Por hacer" del Kanban de esa propiedad — no un badge/alerta separado.
- **Anti-duplicados:** si la tarjeta recurrente de una propiedad sigue abierta (no marcada "Hecha"), no se crea otra aunque pasen los 7 días — el conteo para la siguiente empieza recién cuando se marca "Hecha" la actual.
- **Disparador:** chequeo al cargar el dashboard (`GET /api/data`), no un cron real en el servidor — decisión explícita para no introducir infraestructura nueva en un proyecto que hoy no tiene ninguna tarea programada.
- **Contenido:** una sola tarjeta por ciclo (no tres tareas separadas), título `"Optimización Airbnb — {nombre propiedad}"`, con las notas precargadas como checklist de referencia (cambiar imagen de portada / actualizar descripción con variantes de texto / revisar precio).
- **Registro de cambios de precio:** manual, en el campo "Notas" ya existente de la tarjeta — sin campo estructurado nuevo.

## Fuera de alcance (explícito)

- Recomendación automática de precios.
- Panel de configuración para ajustar el intervalo de 7 días (queda como constante en código).
- Notificaciones push o por email — el recordatorio solo aparece la próxima vez que se abre el dashboard.

## Modelo de datos

`KanbanTask` (`DASHBOARD-BACKEND-FRAK/lib/models/KanbanTask.js`) gana tres campos, todos opcionales/con default — no requiere migración ni afecta tareas existentes:

- `recurring: { type: Boolean, default: false }` — distingue una tarjeta generada por el sistema de una creada manualmente.
- `doneAt: { type: Date, default: null }` — timestamp de cuándo se marcó "Hecha"; usado para calcular el próximo vencimiento.
- `{ timestamps: true }` en el schema (agrega `createdAt`/`updatedAt` automáticos) — usado para el caso "nunca existió ninguna tarjeta para esta propiedad" (bootstrap).

## Lógica del chequeo automático

Vive en una función nueva `lib/ensureRecurringOptimizacionTasks.js`, invocada desde `api/data.js` (el handler de `GET /api/data`) después de cargar `stockProperties` y `kanbanTasks`, antes de pasarlos a `buildDiegoData`:

```
INTERVALO_DIAS = 7

para cada propiedad:
  tareas = kanbanTasks.filter(t => t.property === propiedad.id && t.recurring)
  si tareas.length === 0:
    crear tarjeta nueva (bootstrap, primera vez)
    continuar
  última = tareas.sort por createdAt descendente [0]
  si última.status !== 'done':
    no hacer nada (evita duplicados)
    continuar
  si (ahora - última.doneAt) >= INTERVALO_DIAS días:
    crear tarjeta nueva
```

Las tarjetas creadas se insertan en Mongo y se incluyen en el array `kanbanTasks` que ya se devuelve en la respuesta de `GET /api/data` — el frontend no necesita saber que la lógica existe, solo ve una tarjeta nueva aparecer en "Por hacer".

## Cambio en el endpoint de actualización de status

`api/airbnb.js` (ruta genérica PUT para `resource=kanban`): cuando el `req.body.status` recibido es `'done'`, además de guardar el status, se setea `doneAt: new Date()`. Si el status cambia a cualquier otro valor (tarea reabierta), se limpia `doneAt: null` — así, si alguien reabre y vuelve a cerrar la tarjeta, el ciclo de 7 días se recalcula desde el cierre más reciente, no desde uno viejo.

## Frontend

Sin cambios de UI obligatorios para el MVP: la tarjeta recurrente se ve y se comporta exactamente como cualquier tarjeta manual del Kanban existente (mismo modal, mismo drag-and-drop entre columnas). El título ya es autoexplicativo (`"Optimización Airbnb — Casa PAC"`).

## Testing

Este proyecto no tiene test runner configurado (convención establecida, no un vacío a llenar). La verificación es manual: forzar los tres casos (bootstrap sin tarjetas previas, tarjeta abierta que no debe duplicarse, tarjeta cerrada hace más de 7 días que sí debe generar una nueva) manipulando directamente `doneAt`/`createdAt` en MongoDB para simular el paso del tiempo, y confirmando contra la respuesta real de `GET /api/data` en producción.

## Regla dura

No se borra ni modifica ningún dato existente (estadías, stock, tareas manuales). Los tres campos nuevos en `KanbanTask` son aditivos y no afectan documentos ya creados.
