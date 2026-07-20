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
  // Discrete multi-unit items (sponges, cloths) — pctEnUso here tracks the
  // wear of whichever one is currently active, not overall supply. Supply
  // is qtyBodega/umbralUnidades alone; see isLowStockConsumible in
  // utils/stock.js on the frontend for where this is consumed.
  reusable:       { type: Boolean, default: false },
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});

export default mongoose.models.StockItem
  ?? mongoose.model('StockItem', schema);
