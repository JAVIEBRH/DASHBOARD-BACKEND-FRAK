# Módulo Stock — Diseño
**Fecha:** 2026-07-07
**Proyecto:** Dashboard Send Austral — Inventario por zonas (Casa PAC): consumibles + activos fijos
**Repos:** `DASHBOARD-BACKEND-FRAK` (este doc) + `DASHBOARD-FRONTEND-FRAK`

---

## Contexto

El cliente (dueño de Casa PAC) envió `Inventario casa PAC.xlsx` con el inventario actual de la propiedad. El archivo tiene:

1. **8 hojas de activos fijos por habitación** (LIVING, COMEDOR, COCINA, BAÑO, LAVANDERÍA, DORMITORIO 1-3): muebles, TV, ollas — cosas que no se "acaban" pero sí se puede llevar la cuenta de cuántas unidades hay y si falta reponer alguna.
2. **Hoja "Hoja1" — "INVENTARIO STOCK"**: consumibles reales, con 3 listas paralelas:
   - **"Implementos de aseo"** (cols C/D): cantidad de unidades cerradas en bodega (ej. `4 | jabón 750ml`).
   - **"Reposición de artículos"** (cols H/I): vajilla/equipo que se repone por rotura o pérdida (vasos, platos, cucharas, freidora de aire, condimentero).
   - **"En uso / Estado"** (cols K/L): el envase actualmente abierto de un consumible, medido en % restante (ej. `0.2 | antigrasa 500ml`, o `full`). Se solapa en nombre con ítems de "Implementos de aseo" (mismo producto, dos estados: cerrado en bodega vs. abierto en uso).

Diseño de referencia visual: mockup de Stitch "Split-View Inventory CRUD" (2 pantallas — overview de zonas y detalle CRUD por zona), ver capturas en la sesión del 2026-07-07.

El objetivo es un CRUD vivo organizado por **zona de la casa**: el personal de limpieza actualiza cantidades tras usar/romper/perder productos, y el dashboard alerta cuando algo se está por acabar o agotar, tanto para consumibles como para activos fijos.

---

## Dos modelos separados

Los activos fijos y los consumibles tienen ciclos de vida distintos (un consumible se agota con el uso normal; un mueble se agota por rotura/pérdida/reposición manual), así que son dos colecciones Mongo independientes, unidas solo a nivel de UI/estadísticas agregadas.

### `StockItem` — consumibles (MongoDB, colección `stockitems`)

```js
{
  id:              String,   // 'stock-1' (seed), 'stock-manual-<timestamp>' (manual)
  property:        String,   // 'pac' | 'coyhaique' | 'depto' — hoy todo 'pac'
  category:        String,   // 'ASEO' | 'COCINA' | 'BAÑO' | 'LAVANDERÍA' — agrupación visual
  name:            String,   // 'jabón 750ml'
  unit:            String,   // '750ml', 'rollo', 'litro', 'gramos'
  qtyBodega:       Number,   // unidades cerradas sin abrir en bodega
  pctEnUso:        Number,   // 0-100, null si no hay envase abierto en seguimiento
  umbralUnidades:  Number,   // personalizable por ítem, alerta si qtyBodega <= umbral. Default: 1
  source:          String,   // 'excel' | 'manual'
}
```

**Regla de alerta:**
```
isLowStock(item) = item.qtyBodega <= item.umbralUnidades
                 || (item.pctEnUso != null && item.pctEnUso <= 15)
```
El umbral de `pctEnUso` (15%) es fijo y global, no editable por ítem.

### `FurnitureItem` — activos fijos por zona (MongoDB, colección `furnitureitems`)

```js
{
  id:              String,   // 'furniture-1' (seed), 'furniture-manual-<timestamp>' (manual)
  zone:            String,   // 'living' | 'comedor' | 'cocina' | 'baño' | 'lavanderia' | 'dormitorio1' | 'dormitorio2' | 'dormitorio3'
  category:        String,   // 'Muebles' | 'Iluminación' | 'Vajilla' | 'Equipo' | ... — agrupación visual dentro de la zona
  name:            String,   // 'Sofá 3 Cuerpos'
  qty:             Number,   // cantidad actual de unidades funcionales
  umbralUnidades:  Number,   // alerta si qty <= umbral. Default: 1
  source:          String,   // 'excel' | 'manual'
}
```

**Regla de alerta** (sin `pctEnUso` — no aplica a muebles):
```
isLowStock(item) = item.qty <= item.umbralUnidades
```

`qty === 0` se muestra como "Agotado", `0 < qty <= umbralUnidades` como "Bajo Stock", el resto "En Stock".

---

## Backend — `DASHBOARD-BACKEND-FRAK`

### Estructura nueva

```
lib/
  models/
    StockItem.js          ← Mongoose schema (consumibles)
    FurnitureItem.js       ← Mongoose schema (activos fijos)
api/
  stock/
    index.js               ← POST /api/stock
    [id].js                 ← PUT/DELETE /api/stock/:id
  furniture/
    index.js               ← POST /api/furniture
    [id].js                 ← PUT/DELETE /api/furniture/:id
scripts/
  seed-stock.js            ← parsea Hoja1 (aseo + en uso) → StockItem
  seed-furniture.js        ← parsea las 8 hojas de habitación + reposición de artículos → FurnitureItem
```

### Lectura: sin endpoint nuevo

Siguiendo el patrón existente (`GET /api/data` ya devuelve `transactions`, `categoryMeta`, `properties`), se agregan dos campos al payload de `buildDiegoData()`:

```js
// lib/buildDiegoData.js — dentro de buildDiegoData(transactions, stockItems, furnitureItems)
stock: stockItems.map(s => ({
  id: s.id, property: s.property, category: s.category, name: s.name,
  unit: s.unit, qtyBodega: s.qtyBodega, pctEnUso: s.pctEnUso, umbralUnidades: s.umbralUnidades,
})),
furniture: furnitureItems.map(f => ({
  id: f.id, zone: f.zone, category: f.category, name: f.name,
  qty: f.qty, umbralUnidades: f.umbralUnidades,
})),
```

`api/data.js` consulta las tres colecciones:
```js
const txs = await Transaction.find({}).lean();
const stock = await StockItem.find({}).lean();
const furniture = await FurnitureItem.find({}).lean();
res.json(buildDiegoData(txs, stock, furniture));
```

### Escritura: mismo esqueleto que `api/transactions`

`api/stock/index.js` / `api/stock/[id].js` — sin cambios respecto al diseño original (CORS, `connectDb()`, CRUD contra `StockItem`).

`api/furniture/index.js` y `api/furniture/[id].js` — idéntico esqueleto, contra `FurnitureItem`:

```js
// api/furniture/index.js
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

```js
// api/furniture/[id].js
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

### Seed scripts

**`scripts/seed-stock.js`** — sin cambios respecto al diseño original: parsea "Implementos de aseo" (cols C/D) y "En uso/Estado" (cols K/L) de `Hoja1`, crea `StockItem` con `property='pac'`, `source='excel'`.

**`scripts/seed-furniture.js`** (nuevo):
- Recorre las 8 hojas de habitación (LIVING, COMEDOR, COCINA, BAÑO, LAVANDERÍA, DORMITORIO 1, DORMITORIO 2, DORMITORIO 3). Cada hoja produce `FurnitureItem` con `zone` = nombre de hoja normalizado (minúsculas, sin tildes/espacios: `'living'`, `'dormitorio1'`, etc.), `qty` = cantidad indicada en la hoja, `umbralUnidades = 1` (default), `category` asignada por coincidencia de palabra clave en el nombre (`/sofá|silla|mesa|cama|velador/i` → `'Muebles'`, `/lámpara|ampolleta/i` → `'Iluminación'`, resto → `'Equipo'`).
- Además parsea la lista "Reposición de artículos" (cols H/I) de `Hoja1`: cada ítem se asigna a la zona `'cocina'` con `category = 'Vajilla'` (vasos, platos, cucharas, freidora de aire, condimentero — todo equipo/vajilla de cocina).
- El archivo Excel debe copiarse a la carpeta del proyecto backend (o referenciarse por ruta absoluta) antes de correr el script — se resuelve como tarea concreta en el plan de implementación.
- Se corre una sola vez: `node scripts/seed-furniture.js`.

---

## Frontend — `DASHBOARD-FRONTEND-FRAK`

### Hooks

`src/hooks/useStock.js` — sin cambios respecto al diseño original (optimista sobre `data.stock`, `POST/PUT/DELETE /api/stock`).

`src/hooks/useFurniture.js` — mismo patrón, sobre `data.furniture`:
```js
export function useFurniture(data, setData) {
  const addFurnitureItem = async (itemData) => { /* optimistic push a data.furniture, POST /api/furniture */ };
  const editFurnitureItem = async (id, itemData) => { /* optimistic update, PUT /api/furniture/:id */ };
  const deleteFurnitureItem = async (id) => { /* optimistic remove, DELETE /api/furniture/:id */ };
  return { addFurnitureItem, editFurnitureItem, deleteFurnitureItem };
}
```

### Vista — `src/components/views/StockOverview.jsx`

- Tarjetas de stats arriba: "Total Productos" (`data.stock.length + data.furniture.length`), "Por Agotar" (conteo de `isLowStock` en ambos modelos, sin contar agotados), "Agotados" (conteo de `qty === 0` / `qtyBodega === 0` en ambos modelos).
- Grid de zonas: una tarjeta por cada una de las 8 zonas de muebles + una tarjeta `'stock'` (consumibles). Para las zonas de muebles, la tarjeta agrega sobre `data.furniture.filter(f => f.zone === zoneId)`; para la tarjeta `'stock'`, agrega sobre `data.stock` completo. Cada tarjeta muestra el nombre de la zona, el total de ítems de esa zona, y un badge de estado (rojo si hay algún agotado, amarillo si hay bajo stock sin agotados, verde "All Good" si no hay alertas).
- Clic en una tarjeta navega a `ZoneDetail.jsx` con esa zona.
- Sin sección "Actividad Reciente" (fuera de alcance, ver mockup solo como referencia visual descartada).

### Vista — `src/components/views/ZoneDetail.jsx`

- Componente único reutilizado para las 8 zonas de muebles y para la zona `'stock'`.
- Tabla: Producto / Categoría / Stock (qty o qtyBodega) / Estado (badge derivado de `isLowStock`) / Acciones (editar/eliminar). Cuando la zona es `'stock'`, se agrega una barra de `pctEnUso` bajo el nombre del producto si el ítem tiene envase en uso.
- Buscador de texto + filtro por categoría + filtro por estado.
- Botón "Nuevo Producto" abre el modal de creación (crea `FurnitureItem` o `StockItem` según la zona actual).
- Link "← Back to Overview" vuelve a `StockOverview.jsx`.
- `isLowStock()` para cada modelo vive en `src/utils/stock.js` — una función por modelo, reutilizada en la tabla y en las tarjetas del overview.

### Sidebar — `NAV_GROUPS` y badge

Nueva entrada en `categories.js`:
```js
{ label: 'Operaciones', items: [
  { id: 'stock', label: 'Stock', icon: 'box' },
]},
```
`Sidebar.jsx` calcula el conteo de alertas **solo de `StockItem`** (`data.stock.filter(isLowStockConsumible).length`) y lo muestra como badge rojo junto al ítem "Stock". Las alertas de `FurnitureItem` NO cuentan para este badge — solo se ven al entrar a la zona correspondiente en `ZoneDetail.jsx`.

Se agrega un ícono nuevo `box` a `src/components/ui/Icon.jsx`.

### Toast al cargar

En `App.jsx`, tras cargar `data` exitosamente, si `data.stock.filter(isLowStockConsumible).length > 0`, se dispara `showToast('Tienes N productos con stock bajo', 'error')` una sola vez al montar. Igual que en el diseño original — no incluye alertas de muebles.

### Modal

Se extiende `Modal.jsx` (o se crea una variante) para el formulario de zona: campos comunes `category`, `name`, `qty`/`qtyBodega`, `umbralUnidades`; campo `unit` y `pctEnUso` solo quando la zona activa es `'stock'`. El modal sabe qué modelo crear/editar según la zona desde la que se abrió.

---

## Fuera de alcance

- Autenticación o permisos diferenciados por rol (mismo acceso abierto que el resto del dashboard)
- Umbral de `pctEnUso` personalizable por ítem (queda fijo en 15% global, solo aplica a `StockItem`)
- Historial/auditoría de cambios de stock o muebles ("Actividad Reciente" del mockup es solo referencia visual, no se implementa)
- Notificaciones push/email — solo alertas visuales dentro del dashboard
- Alertas de `FurnitureItem` en el badge del sidebar o el toast de carga — solo alertas de `StockItem` disparan esas notificaciones globales
- Propiedades distintas a `'pac'` (el campo `property` en `StockItem` deja el modelo listo pero no se usa aún; `FurnitureItem` no tiene campo `property` — se agregaría si el dashboard cubre otra propiedad en el futuro)
