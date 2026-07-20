// lib/models/KanbanTask.js
import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  id:        { type: String, required: true, unique: true },
  title:     { type: String, required: true },
  status:    { type: String, enum: ['todo', 'doing', 'done'], default: 'todo' },
  property:  { type: String, default: 'pac' },
  notes:     String,
  recurring: { type: Boolean, default: false },
  doneAt:    { type: Date, default: null },
}, { timestamps: true });

export default mongoose.models.KanbanTask
  ?? mongoose.model('KanbanTask', schema);
