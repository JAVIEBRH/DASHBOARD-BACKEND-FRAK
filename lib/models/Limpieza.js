// lib/models/Limpieza.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  property: { type: String, default: 'pac' },
  date:     { type: String, required: true }, // 'YYYY-MM-DD'
  notes:    String,
  done:     { type: Boolean, default: false },
});

export default mongoose.models.Limpieza
  ?? mongoose.model('Limpieza', schema);
