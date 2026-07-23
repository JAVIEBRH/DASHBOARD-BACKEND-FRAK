// lib/models/StockItem.js
import mongoose from 'mongoose';

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
  // Cuando está seteado, la alerta de este producto se rige por el % restante
  // del envase actualmente en uso (enUso[0].pct) en vez de por qtyBodega —
  // para productos de los que solo hay un envase abierto a la vez
  // (cloro, detergente, quitamanchas...) y donde el conteo en bodega no es
  // el indicador real de cuándo reponer.
  umbralPctEnUso: { type: Number, default: null },
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});

export default mongoose.models.StockItem
  ?? mongoose.model('StockItem', schema);
