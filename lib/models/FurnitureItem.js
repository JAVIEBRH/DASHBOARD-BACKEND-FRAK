// lib/models/FurnitureItem.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  property:       { type: String, default: 'pac' },
  zone:           { type: String, required: true },
  category:       String,
  name:           String,
  qty:            Number,
  umbralUnidades: { type: Number, default: 1 },
  source:         { type: String, enum: ['excel', 'manual'], default: 'manual' },
});

export default mongoose.models.FurnitureItem
  ?? mongoose.model('FurnitureItem', schema);
