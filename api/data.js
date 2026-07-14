// api/data.js
import { connectDb } from '../lib/mongodb.js';
import Transaction from '../lib/models/Transaction.js';
import StockItem from '../lib/models/StockItem.js';
import FurnitureItem from '../lib/models/FurnitureItem.js';
import Property from '../lib/models/Property.js';
import Estadia from '../lib/models/Estadia.js';
import Limpieza from '../lib/models/Limpieza.js';
import KanbanTask from '../lib/models/KanbanTask.js';
import { buildDiegoData } from '../lib/buildDiegoData.js';
import { handleCors } from '../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  await connectDb();
  const txs = await Transaction.find({}).lean();
  const stock = await StockItem.find({}).lean();
  const furniture = await FurnitureItem.find({}).lean();
  const stockProperties = await Property.find({}).lean();
  const estadias = await Estadia.find({}).lean();
  const limpiezas = await Limpieza.find({}).lean();
  const kanbanTasks = await KanbanTask.find({}).lean();
  res.json(buildDiegoData(txs, stock, furniture, stockProperties, estadias, limpiezas, kanbanTasks));
}
