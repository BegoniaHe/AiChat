import assert from 'node:assert/strict';
import { extractTableEditBlocks } from '../../src/scripts/memory/memory-edit-parser.js';
import { validateTemplate } from '../../src/scripts/memory/template-schema.js';
import { buildMemoryTablePlan } from '../../src/scripts/memory/memory-prompt-utils.js';

const renderTemplate = (template, vars) => {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return match;
    return String(vars[key] ?? '');
  });
};

const buildPrompt = ({ templateText, wrapperText, tableData }) => {
  const rendered = renderTemplate(templateText, { tableData });
  if (!wrapperText) return rendered.trim();
  return renderTemplate(wrapperText, { tableData: rendered }).trim();
};

const resolveTableId = (action, tableOrder) => {
  const explicit = String(action?.tableId || action?.tableName || '').trim();
  if (explicit) return explicit;
  const index = Number.isFinite(Number(action?.tableIndex)) ? Math.trunc(Number(action.tableIndex)) : null;
  if (index == null) return '';
  return String(tableOrder[index] || '').trim();
};

const applyMemoryEdits = ({ actions, rows, rowIndexMap, tableOrder }) => {
  const list = Array.isArray(rows) ? rows.slice() : [];
  const map = rowIndexMap && typeof rowIndexMap === 'object' ? rowIndexMap : {};
  const order = Array.isArray(tableOrder) ? tableOrder : [];
  let created = 0;
  const insertRow = (tableId, data) => {
    created += 1;
    const id = `mem_test_${Date.now()}_${created}`;
    list.push({
      id,
      table_id: tableId,
      row_data: data || {},
      is_active: true,
      is_pinned: false,
      priority: 0,
      updated_at: Date.now(),
    });
    return id;
  };
  actions.forEach((action) => {
    const type = String(action?.action || '').toLowerCase();
    const tableId = resolveTableId(action, order);
    if (!tableId) return;
    const rowIndex = Number.isFinite(Number(action?.rowIndex)) ? Math.trunc(Number(action.rowIndex)) : null;
    if (type === 'insert') {
      insertRow(tableId, action?.data || {});
      return;
    }
    if (type === 'update') {
      let rowId = String(action?.rowId || '').trim();
      if (!rowId && rowIndex != null && Array.isArray(map?.[tableId])) {
        rowId = String(map[tableId][rowIndex] || '').trim();
      }
      if (!rowId) {
        const hasRows = list.some(row => String(row.table_id || '') === tableId);
        if (!hasRows) {
          insertRow(tableId, action?.data || {});
        }
        return;
      }
      const target = list.find(row => String(row.id || '') === rowId);
      if (!target) return;
      target.row_data = { ...(target.row_data || {}), ...(action?.data || {}) };
      target.updated_at = Date.now();
      return;
    }
    if (type === 'delete') {
      if (rowIndex != null && Array.isArray(map?.[tableId])) {
        const rowId = String(map[tableId][rowIndex] || '').trim();
        if (rowId) {
          const idx = list.findIndex(row => String(row.id || '') === rowId);
          if (idx >= 0) list.splice(idx, 1);
          return;
        }
      }
    }
  });
  return list;
};

const template = {
  meta: { id: 'tpl_integration', name: 'Integration' },
  tables: [
    {
      id: 'relationship',
      name: '关系记录',
      scope: 'contact',
      columns: [{ id: 'relation', name: '关系', type: 'text' }],
    },
  ],
};

const templateCheck = validateTemplate(template);
assert.equal(templateCheck.ok, true);

const initialRows = [
  {
    id: 'row_1',
    table_id: 'relationship',
    row_data: { relation: '朋友' },
    is_pinned: false,
    priority: 0,
    updated_at: 1,
    contact_id: 'contact_1',
  },
];

const plan = buildMemoryTablePlan({
  rows: initialRows,
  tableById: new Map([['relationship', template.tables[0]]]),
  tableOrder: ['relationship'],
  autoExtract: true,
  maxRows: 10,
  tokenBudgetData: 2000,
  tokenMode: 'rough',
});

const prompt = buildPrompt({
  templateText: 'Memory:\n{{tableData}}',
  wrapperText: '<memories>\n{{tableData}}\n</memories>',
  tableData: plan.tableData,
});

assert.ok(prompt.includes('关系记录'));
assert.ok(prompt.includes('朋友'));

const aiReply = [
  'ok',
  '<tableEdit>',
  'updateRow(0, 0, {"relation":"朋友（暧昧中）"})',
  '</tableEdit>',
].join('\n');

const parsed = extractTableEditBlocks(aiReply);
assert.equal(parsed.actions.length, 1);

const updatedRows = applyMemoryEdits({
  actions: parsed.actions,
  rows: initialRows,
  rowIndexMap: plan.rowIndexMap,
  tableOrder: plan.tableOrder,
});

assert.equal(updatedRows.length, 1);
assert.equal(updatedRows[0].row_data.relation, '朋友（暧昧中）');

const emptyPlan = buildMemoryTablePlan({
  rows: [],
  tableById: new Map([['relationship', template.tables[0]]]),
  tableOrder: ['relationship'],
  autoExtract: true,
  maxRows: 10,
  tokenBudgetData: 2000,
  tokenMode: 'rough',
});

const aiReplyEmpty = [
  '<tableEdit>',
  'updateRow(0, 0, {"relation":"初识"})',
  '</tableEdit>',
].join('\n');
const parsedEmpty = extractTableEditBlocks(aiReplyEmpty);
const insertedRows = applyMemoryEdits({
  actions: parsedEmpty.actions,
  rows: [],
  rowIndexMap: emptyPlan.rowIndexMap,
  tableOrder: emptyPlan.tableOrder,
});

assert.equal(insertedRows.length, 1);
assert.equal(insertedRows[0].row_data.relation, '初识');

console.log('ok - memory integration flow');
