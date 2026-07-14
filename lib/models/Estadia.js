// lib/models/Estadia.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  id:         { type: String, required: true, unique: true },
  property:   { type: String, default: 'pac' },
  guestName:  { type: String, required: true },
  checkIn:    { type: String, required: true }, // 'YYYY-MM-DD'
  checkOut:   { type: String, required: true }, // 'YYYY-MM-DD'
  notes:      String,
});

export default mongoose.models.Estadia
  ?? mongoose.model('Estadia', schema);
