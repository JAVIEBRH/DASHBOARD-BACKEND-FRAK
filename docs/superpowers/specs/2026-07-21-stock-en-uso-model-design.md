# Modelo "En uso" para Stock — Design

## Contexto y motivación

El modelo actual de `StockItem` mezcla `qtyBodega` (cantidad sellada de repuesto) y `pctEnUso` (% de la unidad abierta) de forma ambigua: para algunos productos `pctEnUso` representa el desgaste de un objeto físico reutilizable (esponja, paño, guante) que **no** debería afectar la alerta de stock; para otros representa el nivel de llenado de una botella única que se rellena desde un bidón grande (jabón, shampoo, lavaloza, limpiavidrios, antigrasa, limpiapiso, desmanchador color, desmanchador blanco), donde el % **sí** debería afectar la alerta, pero solo cuando no queda nada de respaldo en bodega.

El parche anterior (campo `reusable: Boolean`) resolvió el caso de las esponjas/paños/guantes, pero no modela correctamente el caso de "una sola botella que se rellena" (ej. `lavaloza cocina 480ml`, marcado por error como `reusable` y que empezó a mostrar "agotado" con la botella al 50% real). Este diseño reemplaza ambos parches por un modelo único que cubre los dos casos sin flags especiales.

## Modelo de datos

`StockItem` cambia de:
```
qtyBodega: Number
pctEnUso: Number | null
umbralUnidades: Number
reusable: Boolean
```
a:
```
qtyBodega: Number                    // unidades selladas de repuesto (sin cambio)
enUso: [{ pct: Number }]             // unidades actualmente activas, cada una con su propio % (0 o más)
umbralUnidades: Number               // umbral de alerta sobre bodega (sin cambio)
```
`reusable` y `pctEnUso` (singular) se eliminan — `enUso` los reemplaza a ambos. `umbralPctCritico` **no** es un campo por producto: queda como una constante de código (60%), igual para todos los productos, por decisión explícita del usuario.

## Lógica de alerta

Reemplaza `isLowStockConsumible`/`stockStatus` en `utils/stock.js`:

```
UMBRAL_PCT_CRITICO = 60  // constante, no configurable por producto

función stockStatus(item):
  si qtyBodega > umbralUnidades:
    retornar 'ok'                                    // bodega sana, el % nunca importa
  si qtyBodega === 0:
    si enUso está vacío O algún elemento de enUso tiene pct <= UMBRAL_PCT_CRITICO:
      retornar 'agotado'                              // sin respaldo Y la única existencia está por acabarse
    retornar 'bajo'                                    // sin respaldo pero la unidad en uso aún tiene margen
  retornar 'bajo'                                       // bodega baja pero no en cero
```

Ejemplo del usuario: bodega=0, 1 unidad en uso al 50% → `agotado` (bodega vacía + la única existencia bajo el 60%).
Esponjas/paños/guantes: nunca se les carga `enUso` con datos reales de %, así que la rama "agotado por %" no aplica — solo manda `qtyBodega` vs `umbralUnidades`, igual que hoy.

## Migración de datos existentes

Los ~60 productos actuales (ambas propiedades) están en tres formas distintas hoy y cada una migra distinto:

1. **Ítems con `pctEnUso` numérico y `reusable: false`** (shampoo, jabón, limpiavidrios, antigrasa, limpiapiso, quita manchas, desmanchadores, cif, cloro, etc.): `enUso: [{ pct: pctEnUso_actual }]`, `qtyBodega` sin cambios.
2. **Ítems con `reusable: true`** (esponjas, paños, guantes): `qtyBodega` sin cambios; si tenían un `pctEnUso` numérico se traduce a `enUso: [{ pct: ese_valor }]` (se conserva como dato informativo, ya no afecta la alerta por diseño); si `pctEnUso` era `null`, `enUso: []`.
3. **Pares ya separados manualmente en la sesión anterior** (`lavaloza 1 litro` + `lavaloza cocina 480ml`; `limpiapisos diluido (en uso)` + `limpiapisos diluido (bodega)`; los 6 dispensadores de baño de San Miguel): estos ya representan físicamente "bodega" y "en uso" como filas separadas — se **fusionan** de vuelta en un solo `StockItem` por producto real (ej. un solo "lavaloza" con `qtyBodega` de la fila bodega y `enUso: [{pct: valor de la fila cocina}]`), ya que el nuevo modelo no necesita filas separadas para representar esto.

La migración es un script único, revisado ítem por ítem antes de ejecutar contra producción — no se ejecuta a ciegas dado que hay fusiones de filas involucradas.

## Cambios de UI (`StockModal.jsx`)

- Se elimina el checkbox "Ítem reutilizable" (ya no aplica) y el campo "% en uso (opcional)" singular.
- Se agrega una sección "Unidades en uso": lista de filas, cada una con un campo % y un botón para eliminar esa unidad; un botón "+ Agregar unidad en uso" para casos con más de una (ej. dispensadores de dos baños). Vacía por defecto para productos que nunca cargan %.
- El resto del formulario (Nombre, Categoría, Cantidad en bodega, Umbral de alerta, Unidad) no cambia.

## Regla dura

No se borra información real de stock durante la migración — cada fila fusionada conserva sus valores (bodega y % de la unidad en uso) en el ítem resultante, solo cambia dónde viven esos números.

## Fuera de alcance

- `umbralPctCritico` configurable por producto (quedó fijo en 60% por decisión explícita).
- Tocar categorías/ítems fuera de Stock (Furniture no se ve afectado).
