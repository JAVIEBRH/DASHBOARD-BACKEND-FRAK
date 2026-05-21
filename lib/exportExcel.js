// lib/exportExcel.js
import XLSX from 'xlsx';

const COL_MAP_19 = [
  null, null,
  { cat: 'AIRBNB',         bucket: 'income'       },
  { cat: 'COMISIONES',     bucket: 'income'       },
  { cat: 'ARTESANIAS',     bucket: 'income'       },
  { cat: 'INTERESES',      bucket: 'auto'         },
  { cat: 'APORTE_SOCIOS',  bucket: 'income'       },
  { cat: 'PROPIETARIOS',   bucket: 'expense_op'   },
  { cat: 'ARTESANIAS',     bucket: 'expense_op'   },
  { cat: 'IMPUESTOS',      bucket: 'expense_op'   },
  { cat: 'COMUNICACIONES', bucket: 'expense_op'   },
  { cat: 'CONTABILIDAD',   bucket: 'expense_op'   },
  { cat: 'RETIROS',        bucket: 'retiro_socio' },
  { cat: 'LIMPIEZA',       bucket: 'expense_op'   },
  { cat: 'INSUMOS',        bucket: 'expense_op'   },
  { cat: 'EQUIPAMIENTO',   bucket: 'expense_op'   },
  { cat: 'PUBLICIDAD',     bucket: 'expense_op'   },
  null, null,
];

const COL_MAP_20 = [
  null, null,
  { cat: 'AIRBNB',         bucket: 'income'       },
  { cat: 'COMISIONES',     bucket: 'income'       },
  { cat: 'ARTESANIAS',     bucket: 'income'       },
  { cat: 'INTERESES',      bucket: 'auto'         },
  { cat: 'APORTE_SOCIOS',  bucket: 'income'       },
  { cat: 'PROPIETARIOS',   bucket: 'expense_op'   },
  { cat: 'ARTESANIAS',     bucket: 'expense_op'   },
  { cat: 'TRANSPORTES',    bucket: 'expense_op'   },
  { cat: 'IMPUESTOS',      bucket: 'expense_op'   },
  { cat: 'COMUNICACIONES', bucket: 'expense_op'   },
  { cat: 'CONTABILIDAD',   bucket: 'expense_op'   },
  { cat: 'RETIROS',        bucket: 'retiro_socio' },
  { cat: 'LIMPIEZA',       bucket: 'expense_op'   },
  { cat: 'INSUMOS',        bucket: 'expense_op'   },
  { cat: 'EQUIPAMIENTO',   bucket: 'expense_op'   },
  { cat: 'PUBLICIDAD',     bucket: 'expense_op'   },
  null, null,
];

const MONTHS_ORDER = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function buildMonthSheet(monthCode, monthTx, saldoInicial) {
  const is26 = monthCode.endsWith('-26');
  const colMap = is26 ? COL_MAP_20 : COL_MAP_19;
  const numCols = colMap.length;
  const totalCol = numCols - 2;
  const saldoCol = numCols - 1;
  const salidasCol = is26 ? 13 : 12;

  const headers = is26
    ? ['FECHA','CONCEPTO','AIRBNB','COMISIONES','ARTESANÍAS','INTERESES','APORTE SOCIOS','A PROPIETARIOS','ARTESANÍAS','TRANSPORTES','IMPUESTOS','COMUNICACIONES','CONTABILIDAD','RETIROS','LIMPIEZA','INSUMOS','EQUIPAMIENTO','PUBLICIDAD','TOTAL','SALDO']
    : ['FECHA','CONCEPTO','AIRBNB','COMISIONES','ARTESANÍAS','INTERESES','APORTE SOCIOS','A PROPIETARIOS','ARTESANÍAS','IMPUESTOS','COMUNICACIONES','CONTABILIDAD','RETIROS','LIMPIEZA','INSUMOS','EQUIPAMIENTO','PUBLICIDAD','TOTAL','SALDO'];

  const getColIdx = (tx) => {
    if (tx.category === 'ARTESANIAS') {
      return tx.bucket === 'income'
        ? colMap.findIndex(m => m && m.cat === 'ARTESANIAS' && m.bucket === 'income')
        : colMap.findIndex(m => m && m.cat === 'ARTESANIAS' && m.bucket !== 'income');
    }
    return colMap.findIndex(m => m && m.cat === tx.category);
  };

  const sorted = [...monthTx].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const aoa = [];
  aoa.push(Array(numCols).fill(null));
  const row1 = Array(numCols).fill(null);
  row1[4] = 'ENTRADAS'; row1[salidasCol] = 'SALIDAS';
  aoa.push(row1);
  aoa.push([...headers]);
  const row3 = Array(numCols).fill(null);
  if (saldoInicial) row3[saldoCol] = saldoInicial;
  aoa.push(row3);

  const colSums = Array(numCols).fill(0);
  for (const tx of sorted) {
    const row = Array(numCols).fill(null);
    if (tx.date) {
      const [y, m, d] = tx.date.split('-').map(Number);
      row[0] = new Date(y, m - 1, d);
    }
    row[1] = tx.concepto;
    const col = getColIdx(tx);
    if (col >= 0) { row[col] = tx.amount; colSums[col] += tx.amount; }
    aoa.push(row);
  }

  const totalRow = Array(numCols).fill(null);
  totalRow[1] = 'Total Mes';
  for (let i = 2; i < totalCol; i++) { if (colSums[i] !== 0) totalRow[i] = colSums[i]; }
  totalRow[totalCol] = monthTx.reduce((s, t) => s + t.amount, 0);
  aoa.push(totalRow);

  return XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
}

export function buildWorkbook(transactions, { month, year }) {
  const wb = XLSX.utils.book_new();
  if (month && month !== 'all') {
    const monthTx = transactions.filter(t => t.month === month);
    const ws = buildMonthSheet(month, monthTx, month === 'ene-25' ? 3196805 : null);
    XLSX.utils.book_append_sheet(wb, ws, month);
    return { wb, filename: `planilla-${month}.xlsx` };
  }
  const yr = year || '2025';
  const suffix = yr === '2025' ? '-25' : '-26';
  const monthsOrder = MONTHS_ORDER.map(m => `${m}-${suffix.slice(1)}`);
  let first = true;
  for (const m of monthsOrder) {
    const monthTx = transactions.filter(t => t.month === m);
    if (!monthTx.length) continue;
    const saldo = first && yr === '2025' ? 3196805 : null;
    first = false;
    XLSX.utils.book_append_sheet(wb, buildMonthSheet(m, monthTx, saldo), m);
  }
  return { wb, filename: `planilla-contable-${yr}.xlsx` };
}
