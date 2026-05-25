import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  { key: { type: String, default: 'main', unique: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} } },
  { timestamps: true }
);

export default mongoose.models.GuideConfig
  ?? mongoose.model('GuideConfig', schema);
