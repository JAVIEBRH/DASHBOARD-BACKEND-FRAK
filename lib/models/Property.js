// lib/models/Property.js
import mongoose from 'mongoose';

const zoneSchema = new mongoose.Schema({
  id:    { type: String, required: true },
  label: { type: String, required: true },
}, { _id: false });

const schema = new mongoose.Schema({
  id:     { type: String, required: true, unique: true },
  name:   { type: String, required: true },
  zones:  { type: [zoneSchema], default: [] },
  color:  { type: String, default: null },
  kind:   { type: String, enum: ['casa', 'departamento', null], default: null },
  source: { type: String, enum: ['seed', 'manual'], default: 'manual' },
});

export default mongoose.models.Property
  ?? mongoose.model('Property', schema);
