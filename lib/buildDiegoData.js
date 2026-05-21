// lib/buildDiegoData.js
const MONTHS_ORDER = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MONTH_NAMES = {
  ene:'Enero', feb:'Febrero', mar:'Marzo', abr:'Abril',
  may:'Mayo', jun:'Junio', jul:'Julio', ago:'Agosto',
  sep:'Septiembre', oct:'Octubre', nov:'Noviembre', dic:'Diciembre',
};

export function buildDiegoData(transactions) {
  const monthsOrder2025 = MONTHS_ORDER.map(m => `${m}-25`);
  const monthsOrder2026 = MONTHS_ORDER.map(m => `${m}-26`);

  const monthLabels = {};
  for (const suffix of ['-25', '-26'])
    for (const m of MONTHS_ORDER)
      monthLabels[`${m}${suffix}`] = MONTH_NAMES[m];

  const tx25 = transactions.filter(t => t.month.endsWith('-25'));
  const tx26 = transactions.filter(t => t.month.endsWith('-26'));

  return {
    saldoInicial: 3196805,
    monthsOrder2025,
    monthsOrder2026,
    monthLabels,
    months2025WithData: [...new Set(tx25.map(t => t.month))],
    months2026WithData: [...new Set(tx26.map(t => t.month))],
    transactions: transactions.map(t => ({
      id: t.id, date: t.date, month: t.month, concepto: t.concepto,
      property: t.property,
      type: t.type === 'income' ? 'pos' : t.type === 'expense' ? 'neg' : t.type,
      category: t.category, bucket: t.bucket, amount: t.amount,
    })),
    buckets: {
      income:       { label: 'Ingreso',          short: 'Ingreso',      color: '#16A34A' },
      expense_op:   { label: 'Gasto operativo',  short: 'Gasto op.',    color: '#DC2626' },
      retiro_socio: { label: 'Movimiento socio', short: 'Retiro socio', color: '#7C3AED' },
    },
    properties: {
      pac:        { id: 'pac',        name: 'Casa PAC',       city: 'Pucón',      status: 'active',   color: '#3B82F6', initials: 'PA' },
      coyhaique:  { id: 'coyhaique',  name: 'Casa Coyhaique', city: 'Coyhaique',  status: 'inactive', color: '#10B981', initials: 'CO' },
      depto:      { id: 'depto',      name: 'Departamento',   city: 'Santiago',   status: 'active',   color: '#8B5CF6', initials: 'DP' },
      unassigned: { id: 'unassigned', name: 'Sin asignar',    city: 'compartido', status: 'pending',  color: '#94A3B8', initials: '??' },
    },
    categoryMeta: {
      AIRBNB:        { label: 'Airbnb',        type: 'income',  color: '#0EA5E9' },
      COMISIONES:    { label: 'Comisiones',     type: 'income',  color: '#10B981' },
      ARTESANIAS:    { label: 'Artesanías',     type: 'mixed',   color: '#D97706' },
      INTERESES:     { label: 'Intereses',      type: 'income',  color: '#6366F1' },
      APORTE_SOCIOS: { label: 'Aporte socios',  type: 'income',  color: '#A855F7' },
      PROPIETARIOS:  { label: 'Propietarios',   type: 'expense', color: '#EF4444' },
      IMPUESTOS:     { label: 'Impuestos',      type: 'expense', color: '#F97316' },
      COMUNICACIONES:{ label: 'Comunicaciones', type: 'expense', color: '#EAB308' },
      LIMPIEZA:      { label: 'Limpieza',       type: 'expense', color: '#16A34A' },
      INSUMOS:       { label: 'Insumos',        type: 'expense', color: '#84CC16' },
      EQUIPAMIENTO:  { label: 'Equipamiento',   type: 'expense', color: '#0D9488' },
      CONTABILIDAD:  { label: 'Contabilidad',   type: 'expense', color: '#2563EB' },
      RETIROS:       { label: 'Retiros',        type: 'expense', color: '#7C3AED' },
      PUBLICIDAD:    { label: 'Publicidad',     type: 'expense', color: '#EC4899' },
      TRANSPORTES:   { label: 'Transportes',    type: 'expense', color: '#64748B' },
    },
  };
}
