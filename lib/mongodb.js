// lib/mongodb.js
import mongoose from 'mongoose';

let cached = global._mongoose ?? (global._mongoose = { conn: null, promise: null });

export async function connectDb() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
