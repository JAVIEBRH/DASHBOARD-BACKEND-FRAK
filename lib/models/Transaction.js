// lib/models/Transaction.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  date:     String,
  month:    { type: String, required: true },
  concepto: String,
  property: String,
  type:     String,
  category: String,
  bucket:   String,
  amount:   Number,
  source:   { type: String, enum: ['excel', 'manual'], default: 'manual' },
});

export default mongoose.models.Transaction
  ?? mongoose.model('Transaction', schema);
