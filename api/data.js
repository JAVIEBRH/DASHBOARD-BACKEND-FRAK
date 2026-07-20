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
import { ensureRecurringOptimizacionTasks } from '../lib/ensureRecurringOptimizacionTasks.js';

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
  let kanbanTasks = await KanbanTask.find({}).lean();

  const newlyCreated = await ensureRecurringOptimizacionTasks(stockProperties, kanbanTasks);
  if (newlyCreated.length > 0) {
    kanbanTasks = [...kanbanTasks, ...newlyCreated.map(doc => doc.toObject())];
  }

  res.json(buildDiegoData(txs, stock, furniture, stockProperties, estadias, limpiezas, kanbanTasks));
}
