// api/export/excel.js
import XLSX from 'xlsx';
import { connectDb } from '../../lib/mongodb.js';
import Transaction from '../../lib/models/Transaction.js';
import { buildWorkbook } from '../../lib/exportExcel.js';
import { handleCors } from '../../lib/cors.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).end();
  await connectDb();
  const transactions = await Transaction.find({}).lean();
  const { month, year } = req.query;
  const { wb, filename } = buildWorkbook(transactions, { month, year });
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}
