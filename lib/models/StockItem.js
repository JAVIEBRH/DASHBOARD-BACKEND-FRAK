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
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});

export default mongoose.models.StockItem
  ?? mongoose.model('StockItem', schema);
