import React, { useCallback, useEffect, useState } from 'react';
import {
  Database,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type {
  DbColumnDef,
  DbOverviewResponse,
  DbQueryResponse,
  DbTableRowsResponse,
} from '../types.ts';
import { Modal } from './Modal.tsx';
import { StatusText } from './StatusText.tsx';

interface DatabaseControlViewProps {
  onDataChanged: () => void;
}

const SQL_PRESETS = [
  {
    label: 'Active Students',
    sql: "SELECT StudentID, SectionID, Name, Email, Status FROM Student ORDER BY StudentID DESC LIMIT 50",
  },
  {
    label: 'Recent DB Changes',
    sql: 'SELECT LogID, ActionType, AffectedTable, AffectedRecordID, Reason, Status, Timestamp FROM Log ORDER BY LogID DESC LIMIT 25',
  },
  {
    label: 'Section Enrollment Counts',
    sql: 'SELECT s.SectionID, s.SectionName, COUNT(st.StudentID) AS TotalStudents FROM Section s LEFT JOIN Student st ON st.SectionID = s.SectionID GROUP BY s.SectionID, s.SectionName ORDER BY s.SectionName ASC',
  },
];

export function DatabaseControlView({ onDataChanged }: DatabaseControlViewProps) {
  const [subTab, setSubTab] = useState<'tables' | 'sql' | 'changes'>('tables');
  const [overview, setOverview] = useState<DbOverviewResponse | null>(null);
  const [selectedTable, setSelectedTable] = useState<string>('Student');
  const [tableData, setTableData] = useState<DbTableRowsResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingTable, setLoadingTable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Add / Edit Row Modal
  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [rowForm, setRowForm] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  // Delete Row Confirm Modal
  const [deletingRow, setDeletingRow] = useState<Record<string, unknown> | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  // Clear / Reseed Confirm Modal
  const [clearModalMode, setClearModalMode] = useState<'academic' | 'reseed' | null>(null);
  const [clearBusy, setClearBusy] = useState(false);

  // SQL Console
  const [sqlInput, setSqlInput] = useState(SQL_PRESETS[0].sql);
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<DbQueryResponse | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const res = await apiRequest<DbOverviewResponse>('/api/admin/db/overview');
      setOverview(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load database overview.');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadTable = useCallback(async (tableName: string) => {
    setLoadingTable(true);
    setError(null);
    try {
      const res = await apiRequest<DbTableRowsResponse>(`/api/admin/db/table/${tableName}`);
      setTableData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${tableName}.`);
    } finally {
      setLoadingTable(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (selectedTable) {
      loadTable(selectedTable);
    }
  }, [selectedTable, loadTable]);

  const refreshAll = async () => {
    await Promise.all([loadOverview(), loadTable(selectedTable)]);
    onDataChanged();
  };

  const openInsertModal = () => {
    if (!tableData) return;
    setEditingRow(null);
    const initial: Record<string, string> = {};
    for (const col of tableData.columns) {
      if (col.auto) continue;
      if (col.name === 'Status' && tableData.table === 'Student') initial[col.name] = 'Active';
      else if (col.name === 'Status' && tableData.table === 'Attendance') initial[col.name] = 'Present';
      else if (col.name === 'Date') initial[col.name] = new Date().toISOString().slice(0, 10);
      else initial[col.name] = '';
    }
    setRowForm(initial);
    setRowError(null);
    setRowModalOpen(true);
  };

  const openEditModal = (row: Record<string, unknown>) => {
    if (!tableData) return;
    setEditingRow(row);
    const initial: Record<string, string> = {};
    for (const col of tableData.columns) {
      const v = row[col.name];
      initial[col.name] = v === null || v === undefined ? '' : String(v);
    }
    setRowForm(initial);
    setRowError(null);
    setRowModalOpen(true);
  };

  const handleSaveRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableData) return;
    setSavingRow(true);
    setRowError(null);
    setNotice(null);
    try {
      if (editingRow) {
        await apiRequest(`/api/admin/db/table/${tableData.table}/row`, {
          method: 'PUT',
          body: JSON.stringify(rowForm),
        });
        setNotice(`Updated record in ${tableData.table}. Change logged.`);
      } else {
        await apiRequest(`/api/admin/db/table/${tableData.table}/row`, {
          method: 'POST',
          body: JSON.stringify(rowForm),
        });
        setNotice(`Inserted new record into ${tableData.table}. Change logged.`);
      }
      setRowModalOpen(false);
      await refreshAll();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'Unable to save record.');
    } finally {
      setSavingRow(false);
    }
  };

  const handleDeleteRow = async () => {
    if (!tableData || !deletingRow) return;
    setDeletingBusy(true);
    setError(null);
    setNotice(null);
    try {
      const pkPayload: Record<string, unknown> = {};
      for (const pk of tableData.primaryKeys) {
        pkPayload[pk] = deletingRow[pk];
      }
      await apiRequest(`/api/admin/db/table/${tableData.table}/row`, {
        method: 'DELETE',
        body: JSON.stringify(pkPayload),
      });
      setDeletingRow(null);
      setNotice(`Deleted record from ${tableData.table}. Change logged.`);
      await refreshAll();
    } catch (err) {
      setDeletingRow(null);
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to delete row (it may be referenced by child records).'
      );
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!clearModalMode) return;
    setClearBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiRequest('/api/admin/db/clear', {
        method: 'POST',
        body: JSON.stringify({ mode: clearModalMode }),
      });
      const doneMode = clearModalMode;
      setClearModalMode(null);
      setNotice(
        doneMode === 'reseed'
          ? 'Database cleared and sample dataset re-seeded.'
          : 'Cleared all academic & faculty data (Admin accounts preserved).'
      );
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear database.');
      setClearModalMode(null);
    } finally {
      setClearBusy(false);
    }
  };

  const handleRunSql = async (e: React.FormEvent) => {
    e.preventDefault();
    setSqlRunning(true);
    setSqlError(null);
    setNotice(null);
    try {
      const res = await apiRequest<DbQueryResponse>('/api/admin/db/query', {
        method: 'POST',
        body: JSON.stringify({ sql: sqlInput }),
      });
      setSqlResult(res);
      if (res.kind === 'mutation') {
        setNotice(`SQL executed (${res.affectedRows} rows affected). Change logged.`);
        await refreshAll();
      }
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : 'SQL execution failed.');
    } finally {
      setSqlRunning(false);
    }
  };

  const totalRows = overview?.tables.reduce((acc, t) => acc + t.rowCount, 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Database Target & Direct Actions Strip */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-blue-700 shrink-0">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-slate-900">
                Direct Database Control
              </h2>
              <span className="font-mono text-xs text-slate-500">
                {overview ? overview.target : 'Connecting...'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {overview
                ? `${overview.tables.length} schema tables · ${totalRows} total records · All database mutations are recorded in Log`
                : 'Loading schema summary...'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={refreshAll}
            disabled={loadingOverview}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setClearModalMode('reseed')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset &amp; Re-seed Demo</span>
          </button>

          <button
            type="button"
            onClick={() => setClearModalMode('academic')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Data</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
          {[
            { id: 'tables', label: 'Tables & Rows' },
            { id: 'sql', label: 'SQL Console' },
            { id: 'changes', label: `DB Change Log (${overview?.recentChanges.length ?? 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as typeof subTab)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                subTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {subTab === 'tables' && tableData && (
          <button
            type="button"
            onClick={openInsertModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-800 whitespace-nowrap self-start sm:self-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Insert into {tableData.table}</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* TAB 1: TABLE BROWSER & DIRECT ROW CONTROL */}
      {subTab === 'tables' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Table List */}
          <div className="lg:col-span-3 rounded-xl border border-slate-200 bg-white overflow-hidden self-start">
            <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Schema Tables
            </div>
            <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto">
              {(overview?.tables ?? []).map((tbl) => {
                const active = selectedTable === tbl.name;
                return (
                  <button
                    key={tbl.name}
                    type="button"
                    onClick={() => setSelectedTable(tbl.name)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                      active ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono text-xs">{tbl.name}</span>
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      {tbl.rowCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table Rows Grid */}
          <div className="lg:col-span-9 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
              <div>
                <h3 className="font-mono text-sm font-semibold text-slate-900">
                  {selectedTable}
                </h3>
                <p className="text-xs text-slate-500">
                  {tableData
                    ? `Showing ${tableData.rows.length} row(s) · Primary Key: ${tableData.primaryKeys.join(', ')}`
                    : 'Loading rows...'}
                </p>
              </div>
            </div>

            {loadingTable || !tableData ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 rounded bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : tableData.rows.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-slate-500">
                Table <span className="font-mono font-semibold">{tableData.table}</span> is empty.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 font-medium text-slate-500">
                      {tableData.columns.map((col) => (
                        <th key={col.name} className="px-4 py-2.5 font-mono whitespace-nowrap">
                          {col.name}
                        </th>
                      ))}
                      <th className="px-4 py-2.5 text-right whitespace-nowrap">Row Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {tableData.columns.map((col) => {
                          const val = row[col.name];
                          return (
                            <td
                              key={col.name}
                              className="px-4 py-2.5 font-mono text-slate-800 max-w-[220px] truncate"
                              title={val === null || val === undefined ? 'NULL' : String(val)}
                            >
                              {val === null || val === undefined ? (
                                <span className="text-slate-400">NULL</span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(row)}
                              aria-label={`Edit row in ${tableData.table}`}
                              className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingRow(row)}
                              aria-label={`Delete row from ${tableData.table}`}
                              className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DIRECT SQL CONSOLE */}
      {subTab === 'sql' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-900">
                Execute SQL on {overview?.target || 'Active Database'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {SQL_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setSqlInput(preset.sql)}
                    className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleRunSql} className="space-y-3">
              <textarea
                rows={4}
                value={sqlInput}
                onChange={(e) => setSqlInput(e.target.value)}
                placeholder="Enter a single SQL statement (e.g. SELECT * FROM Student)..."
                className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Single-statement execution. Mutating queries (INSERT, UPDATE, DELETE) are automatically logged.
                </p>
                <button
                  type="submit"
                  disabled={sqlRunning}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60 whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>{sqlRunning ? 'Executing...' : 'Run Query'}</span>
                </button>
              </div>
            </form>

            {sqlError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 font-mono">
                {sqlError}
              </div>
            )}
          </div>

          {sqlResult && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {sqlResult.kind === 'mutation' ? (
                <div className="p-5 text-sm text-slate-800">
                  Query executed successfully. Affected rows:{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {sqlResult.affectedRows}
                  </span>
                  {sqlResult.insertId > 0 && (
                    <>
                      {' '}
                      · Insert ID:{' '}
                      <span className="font-mono font-semibold tabular-nums">
                        #{sqlResult.insertId}
                      </span>
                    </>
                  )}
                </div>
              ) : sqlResult.rows.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">
                  Query returned 0 rows.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500 font-mono">
                    {sqlResult.rowCount} row(s) returned
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/70 font-mono text-slate-500">
                        {sqlResult.columns.map((c) => (
                          <th key={c} className="px-4 py-2.5 whitespace-nowrap">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sqlResult.rows.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          {sqlResult.columns.map((c) => (
                            <td key={c} className="px-4 py-2 font-mono text-slate-800 whitespace-nowrap">
                              {r[c] === null || r[c] === undefined ? (
                                <span className="text-slate-400">NULL</span>
                              ) : (
                                String(r[c])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LIVE DATABASE CHANGE LOG */}
      {subTab === 'changes' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Database Change Stream
            </h3>
            <p className="text-xs text-slate-500">
              Latest 25 mutations recorded across application endpoints and direct database control
            </p>
          </div>
          {!overview || overview.recentChanges.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No database change entries recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="px-5 py-3">Log ID / Time</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Operation</th>
                    <th className="px-4 py-3">Description / Reason</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.recentChanges.map((log) => (
                    <tr key={log.LogID} className="hover:bg-slate-50">
                      <td className="px-5 py-3 whitespace-nowrap">
                        <div className="font-mono text-xs font-medium text-slate-800 tabular-nums">
                          #{log.LogID}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {log.Timestamp}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700 whitespace-nowrap">
                        {log.AdminName || log.TeacherName || 'System'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-800">
                          {log.ActionType}
                        </span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        <span className="font-mono text-xs text-slate-600">
                          {log.AffectedTable} #{log.AffectedRecordID}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-800 max-w-md">
                        {log.Reason}
                      </td>
                      <td className="px-5 py-3">
                        <StatusText status={log.Status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Insert / Edit Row Modal */}
      <Modal
        open={rowModalOpen}
        onClose={() => setRowModalOpen(false)}
        title={
          editingRow
            ? `Edit Row · ${tableData?.table ?? ''}`
            : `Insert Row · ${tableData?.table ?? ''}`
        }
        subtitle="Direct table edits are immediately recorded in the Log table."
      >
        {tableData && (
          <form onSubmit={handleSaveRow} className="space-y-3.5">
            {tableData.columns.map((col: DbColumnDef) => {
              const isPk = tableData.primaryKeys.includes(col.name);
              if (col.auto && !editingRow) return null;
              return (
                <div key={col.name}>
                  <label
                    htmlFor={`db-col-${col.name}`}
                    className="block text-xs font-mono font-medium text-slate-700"
                  >
                    {col.name}{' '}
                    {col.required && !col.auto && <span className="text-red-600">*</span>}
                    {col.secret && editingRow && (
                      <span className="text-slate-400 font-sans font-normal">
                        {' '}
                        (leave unchanged to keep current password)
                      </span>
                    )}
                  </label>
                  <input
                    id={`db-col-${col.name}`}
                    type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                    step={col.type === 'number' ? 'any' : undefined}
                    required={Boolean(col.required && !(col.secret && editingRow))}
                    disabled={Boolean(editingRow && isPk)}
                    value={rowForm[col.name] ?? ''}
                    onChange={(e) =>
                      setRowForm((prev) => ({ ...prev, [col.name]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              );
            })}

            {rowError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {rowError}
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRowModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRow}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-60"
              >
                {savingRow ? 'Saving...' : editingRow ? 'Update Row' : 'Insert Row'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Row Modal */}
      <Modal
        open={Boolean(deletingRow)}
        onClose={() => setDeletingRow(null)}
        title={`Delete Row from ${tableData?.table ?? ''}`}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Are you sure you want to permanently delete this row? Foreign-key constraints may block deletion if child rows reference it.
          </p>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setDeletingRow(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deletingBusy}
              onClick={handleDeleteRow}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {deletingBusy ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Clear Data / Re-seed Confirmation Modal */}
      <Modal
        open={Boolean(clearModalMode)}
        onClose={() => setClearModalMode(null)}
        title={
          clearModalMode === 'reseed'
            ? 'Reset & Re-seed Demo Dataset'
            : 'Clear Database Data'
        }
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            {clearModalMode === 'reseed'
              ? 'This will clear all academic, teacher, and log records in the database and restore the initial sample dataset (Admin accounts are preserved so your session stays active).'
              : 'This will permanently delete all records from Course, Subject, CourseSubject, Teacher, Section, SectionSubject, Student, Assessment, StudentScore, Attendance, and Log. Admin accounts are preserved so you stay signed in.'}
          </p>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setClearModalMode(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={clearBusy}
              onClick={handleClearDatabase}
              className={`rounded-lg px-4 py-2 text-xs font-medium text-white disabled:opacity-60 ${
                clearModalMode === 'reseed'
                  ? 'bg-blue-700 hover:bg-blue-800'
                  : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {clearBusy
                ? 'Processing...'
                : clearModalMode === 'reseed'
                ? 'Reset & Re-seed'
                : 'Clear All Data'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
