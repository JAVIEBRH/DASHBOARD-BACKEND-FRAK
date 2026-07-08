# Módulo Stock — Diseño
**Fecha:** 2026-07-07
**Proyecto:** Dashboard Send Austral — Sistema de alertas de stock (Casa PAC)
**Repos:** `DASHBOARD-BACKEND-FRAK` (este doc) + `DASHBOARD-FRONTEND-FRAK`

---

## Contexto

El cliente (dueño de Casa PAC) envió `Inventario casa PAC.xlsx` con el inventario actual de la propiedad. El archivo mezcla dos tipos de datos:

1. **Activos fijos** (hojas LIVING, COMEDOR, COCINA, BAÑO, LAVANDERÍA, DORMITORIO 1-3): muebles, TV, ollas — cosas que no se "acaban". **Fuera de alcance.**
2. **Hoja "Hoja1" — "INVENTARIO STOCK"**: consumibles reales, con 3 listas paralelas:
   - **"Implementos de aseo"** (cols C/D): cantidad de unidades cerradas en bodega (ej. `4 | jabón 750ml`). **En alcance.**
   - **"Reposición de artículos"** (cols H/I): vajilla/equipo que se repone por rotura o pérdida (vasos, platos, cucharas, freidora de aire, condimentero). Misma naturaleza que los activos fijos — no es un consumible que "se acaba con el uso". **Fuera de alcance.**
   - **"En uso / Estado"** (cols K/L): el envase actualmente abierto de un consumible, medido en % restante (ej. `0.2 | antigrasa 500ml`, o `full`). Se solapa en nombre con ítems de la lista de aseo (mismo producto, dos estados: cerrado en bodega vs. abierto en uso). **En alcance.**

El objetivo es un CRUD vivo: el personal de limpieza actualiza cantidades tras usar productos, y el dashboard alerta cuando algo se está por acabar.

---

## Modelo de datos — `StockItem` (MongoDB)

```js
// Collection: stockitems
{
  id:              String,   // 'stock-1' (seed), 'stock-manual-<timestamp>' (manual)
  property:        String,   // 'pac' | 'coyhaique' | 'depto' — hoy todo 'pac', deja el modelo listo para más propiedades
  category:        String,   // 'ASEO' | 'COCINA' | 'BAÑO' | 'LAVANDERÍA' — agrupación visual, derivada del nombre del ítem
  name:            String,   // 'jabón 750ml'
  unit:            String,   // '750ml', 'rollo', 'litro', 'gramos'
  qtyBodega:       Number,   // unidades cerradas sin abrir en bodega
  pctEnUso:        Number,   // 0-100, null si no hay envase abierto en seguimiento para este ítem
  umbralUnidades:  Number,   // personalizable por ítem — alerta si qtyBodega <= umbralUnidades. Default: 1
  source:          String,   // 'excel' | 'manual'
}
```

**Regla de alerta** (calculada en el momento, no se almacena un campo booleano):
```
isLowStock(item) = item.qtyBodega <= item.umbralUnidades
                 || (item.pctEnUso != null && item.pctEnUso <= 15)
```
El umbral de `pctEnUso` (15%) es fijo y global, no editable por ítem — decisión explícita para no duplicar el campo de umbral por cada escala.

---

## Backend — `DASHBOARD-BACKEND-FRAK`

### Estructura nueva

```
lib/
  models/
    StockItem.js          ← Mongoose schema
api/
  stock/
    index.js               ← POST /api/stock (crear)
    [id].js                 ← PUT /api/stock/:id (editar), DELETE /api/stock/:id (eliminar)
scripts/
  seed-stock.js            ← parsea Hoja1 → inserta StockItem con property='pac', source='excel'
```

### Lectura: sin endpoint nuevo

Siguiendo el patrón existente (`GET /api/data` ya devuelve `transactions`, `categoryMeta`, `properties` en un solo fetch), se agrega un campo `stock: [...]` al payload de `buildDiegoData()` en `lib/buildDiegoData.js`. El frontend no hace un segundo round-trip para leer stock — lo recibe junto con el resto de los datos al cargar el dashboard.

```js
// lib/buildDiegoData.js — dentro de buildDiegoData(transactions, stockItems)
stock: stockItems.map(s => ({
  id: s.id, property: s.property, category: s.category, name: s.name,
  unit: s.unit, qtyBodega: s.qtyBodega, pctEnUso: s.pctEnUso, umbralUnidades: s.umbralUnidades,
})),
```

`api/data.js` pasa a consultar ambas colecciones:
```js
const txs = await Transaction.find({}).lean();
const stock = await StockItem.find({}).lean();
res.json(buildDiegoData(txs, stock));
```

### Escritura: `api/stock/index.js` y `api/stock/[id].js`

Mismo esqueleto que `api/transactions/index.js` y `api/transactions/[id].js` — CORS, `connectDb()`, CRUD contra el modelo:

```js
// api/stock/index.js
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

```js
// api/stock/[id].js
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

### Seed script — `scripts/seed-stock.js`

Parsea únicamente las listas "Implementos de aseo" (cols C/D) y "En uso/Estado" (cols K/L) de la hoja `Hoja1` de `Inventario casa PAC.xlsx`. Ignora la lista "Reposición de artículos" (cols H/I, fuera de alcance).

- Lista aseo → un `StockItem` por fila con `qtyBodega = valor columna C`, `pctEnUso = null`, `umbralUnidades = 1` (default), `category` asignada por coincidencia de palabra clave en el nombre: `/lavadora|ropa|suavizante/i` → `LAVANDERÍA`, `/lavaloza|cocina|antigrasa/i` → `COCINA`, todo lo demás → `ASEO` (categoría por defecto, ya que la mayoría de la lista es efectivamente productos de aseo general).
- Lista "en uso" → si el nombre coincide con un ítem ya creado desde la lista de aseo, se le completa `pctEnUso` (convertir `"full"` → `100`, valores decimales `0.2` → `20`). Si no coincide ningún ítem existente, se crea uno nuevo con `qtyBodega = 0` y el `pctEnUso` correspondiente.
- El archivo Excel debe copiarse a la carpeta del proyecto backend (o referenciarse por ruta absoluta) antes de correr el script — se resuelve como tarea concreta en el plan de implementación.
- Se corre una sola vez: `node scripts/seed-stock.js`.

---

## Frontend — `DASHBOARD-FRONTEND-FRAK`

### Hook — `src/hooks/useStock.js`

No vuelve a hacer fetch: recibe `data`/`setData` ya cargados por `useTransactions()` (que ahora también trae `data.stock`) y expone mutaciones optimistas sobre ese mismo estado compartido:

```js
export function useStock(data, setData) {
  const addStockItem = async (itemData) => { /* optimistic push a data.stock, POST /api/stock */ };
  const editStockItem = async (id, itemData) => { /* optimistic update, PUT /api/stock/:id */ };
  const deleteStockItem = async (id) => { /* optimistic remove, DELETE /api/stock/:id */ };
  return { addStockItem, editStockItem, deleteStockItem };
}
```

### Vista — `src/components/views/Stock.jsx`

- Sección "Alertas" arriba: ítems donde `isLowStock(item)` es `true`, tarjetas rojo/naranja.
- Debajo, lista completa agrupada por `category` (ASEO, COCINA, BAÑO, LAVANDERÍA…), cada fila muestra nombre, unidad, `qtyBodega`, barra de `pctEnUso` (si aplica), botones editar/eliminar.
- Botón "+ Agregar ítem" abre el modal de creación.
- `isLowStock()` vive en `src/utils/stock.js` (o `categories.js`) y se reutiliza tanto en la vista como en el badge del sidebar — una sola fuente de verdad para la regla de alerta.

### Sidebar — `NAV_GROUPS` y badge

Nueva entrada en `categories.js`:
```js
{ label: 'Operaciones', items: [
  { id: 'stock', label: 'Stock', icon: 'box' },
]},
```
`Sidebar.jsx` calcula el conteo de alertas (`data.stock.filter(isLowStock).length`) y lo muestra como badge rojo junto al ítem "Stock", visible sin importar la vista activa.

Se agrega un ícono nuevo `box` a `src/components/ui/Icon.jsx` (ningún ícono existente representa inventario/paquete).

### Toast al cargar

En `App.jsx`, tras cargar `data` exitosamente, si `data.stock.filter(isLowStock).length > 0`, se dispara un `showToast('Tienes N productos con stock bajo', 'error')` una sola vez al montar.

### Modal

Se extiende `Modal.jsx` (o se crea una variante) para el formulario de stock: `category`, `name`, `unit`, `qtyBodega`, `pctEnUso` (opcional), `umbralUnidades`, `property`. Mismo patrón visual/interacción que el modal de transacciones.

---

## Fuera de alcance

- Activos fijos / inventario de muebles y equipo (las 8 hojas restantes del Excel)
- Vajilla/equipo de reposición por rotura ("Reposición de artículos": vasos, platos, freidora de aire, etc.)
- Autenticación o permisos diferenciados por rol (mismo acceso abierto que el resto del dashboard)
- Umbral de `pctEnUso` personalizable por ítem (queda fijo en 15% global)
- Historial/auditoría de cambios de stock (quién cambió qué y cuándo)
- Notificaciones push/email — solo alertas visuales dentro del dashboard
