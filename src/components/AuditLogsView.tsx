import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Search,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from 'lucide-react';
import { apiRequest, downloadCsv } from '../lib/api.ts';
import type { AuditLog, AuthUser, MaintenanceStatus } from '../types.ts';
import { Modal } from './Modal.tsx';
import { StatusText } from './StatusText.tsx';

interface AuditLogsViewProps {
  user: AuthUser;
  defaultStatus?: string;
  onDataChanged: () => void;
}

export function AuditLogsView({
  user,
  defaultStatus,
  onDataChanged,
}: AuditLogsViewProps) {
  const isAdmin = user.role === 'admin';
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>(
    defaultStatus || (isAdmin ? 'Pending' : 'all')
  );
  const [actionFilter, setActionFilter] = useState('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Review Modal (Admin)
  const [reviewLog, setReviewLog] = useState<AuditLog | null>(null);
  const [reviewing, setReviewing] = useState(false);

  // Maintenance Modal (Admin)
  const [maintOpen, setMaintOpen] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('50');
  const [maintMsg, setMaintMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        actionType: actionFilter,
        affectedTable: tableFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const logRows = await apiRequest<AuditLog[]>(`/api/logs?${params.toString()}`);
      setLogs(logRows);

      if (isAdmin) {
        const m = await apiRequest<MaintenanceStatus>('/api/logs/maintenance');
        setMaintenance(m);
        setThresholdInput(String(m.maxThreshold));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, actionFilter, tableFilter, search, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReviewDecision = async (decision: 'Approved' | 'Rejected') => {
    if (!reviewLog) return;
    setReviewing(true);
    setError(null);
    try {
      await apiRequest(`/api/logs/${reviewLog.LogID}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setReviewLog(null);
      await loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review.');
    } finally {
      setReviewing(false);
    }
  };

  const handleMaintenanceAction = async (
    action: 'update_settings' | 'prune_resolved' | 'prune_system_events'
  ) => {
    setMaintMsg(null);
    try {
      const res = await apiRequest<{ ok: boolean; deletedCount: number }>('/api/logs/maintenance', {
        method: 'POST',
        body: JSON.stringify({
          action,
          maxThreshold: Number(thresholdInput),
          keepCount: 10,
        }),
      });
      if (action === 'update_settings') {
        setMaintMsg('Maintenance threshold settings updated.');
      } else {
        setMaintMsg(`Cleaned ${res.deletedCount} non-pending log entries. All Pending items preserved.`);
      }
      await loadData();
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Maintenance action failed.');
    }
  };

  const handleExportLogs = () => {
    downloadCsv(
      'audit-logs.csv',
      ['Log ID', 'Timestamp', 'Actor', 'Action', 'Table', 'Record ID', 'Reason', 'Status', 'Reviewed By'],
      logs.map((l) => [
        l.LogID,
        l.Timestamp,
        l.TeacherName || l.AdminName || 'System',
        l.ActionType,
        l.AffectedTable,
        l.AffectedRecordID,
        l.Reason,
        l.Status,
        l.AdminName || '',
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Admin Maintenance Alert Banner if threshold reached */}
      {isAdmin && maintenance?.needsMaintenance && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm text-amber-900">
          <div>
            <span className="font-semibold">Log capacity threshold reached:</span>{' '}
            <span className="font-mono tabular-nums">
              {maintenance.totalLogs} / {maintenance.maxThreshold}
            </span>{' '}
            entries stored. Clean resolved logs while preserving pending items.
          </div>
          <button
            type="button"
            onClick={() => setMaintOpen(true)}
            className="rounded-lg bg-amber-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-amber-800 whitespace-nowrap shrink-0"
          >
            Open Log Maintenance
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented status filter */}
          <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {(['Pending', 'all', 'Approved', 'Rejected', 'Logged'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st === 'all' ? 'All Logs' : st}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reason or teacher..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            aria-label="Filter by action type"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="all">All Actions</option>
            <option value="ADD">ADD</option>
            <option value="EDIT">EDIT</option>
            <option value="DELETE">DELETE</option>
            <option value="LOGIN">LOGIN</option>
            <option value="REGISTER">REGISTER</option>
            <option value="CLEANUP">CLEANUP</option>
          </select>

          <select
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            aria-label="Filter by affected table"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
          >
            <option value="all">All Records</option>
            <option value="Student">Student</option>
            <option value="Section">Section</option>
            <option value="SectionSubject">SectionSubject</option>
            <option value="Assessment">Assessment</option>
            <option value="StudentScore">StudentScore</option>
            <option value="Attendance">Attendance</option>
            <option value="Course">Course</option>
            <option value="Subject">Subject</option>
            <option value="CourseSubject">CourseSubject</option>
            <option value="Teacher">Teacher</option>
            <option value="Admin">Admin</option>
            <option value="Log">Log</option>
            <option value="DirectSQL">DirectSQL</option>
            <option value="Database">Database</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportLogs}
            disabled={logs.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setMaintMsg(null);
                setMaintOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>
                Maintenance ({maintenance ? `${maintenance.totalLogs}/${maintenance.maxThreshold}` : '—'})
              </span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">
              {statusFilter === 'Pending'
                ? 'No pending reviews in the queue'
                : 'No audit log entries match your filters'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {statusFilter === 'Pending'
                ? 'All teacher-submitted record changes have been reviewed.'
                : 'Try adjusting the status or action filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">ID / Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Operation</th>
                  <th className="px-4 py-3">Documented Reason</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reviewed By</th>
                  {isAdmin && <th className="px-5 py-3 text-right">Oversight</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.LogID} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="font-mono text-xs font-medium text-slate-800 tabular-nums">
                        #{log.LogID}
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {log.Timestamp}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-medium text-slate-900">
                        {log.TeacherName || log.AdminName || 'System'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {log.TeacherID ? `Teacher #${log.TeacherID}` : log.AdminID ? `Admin #${log.AdminID}` : 'System'}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-xs font-semibold text-slate-800">
                        {log.ActionType}
                      </span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span className="text-xs text-slate-600">
                        {log.AffectedTable} #{log.AffectedRecordID}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <div className="text-sm text-slate-800">{log.Reason}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={log.Status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                      {log.AdminName || '—'}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {log.Status === 'Pending' ? (
                          <button
                            type="button"
                            onClick={() => setReviewLog(log)}
                            className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
                          >
                            Review
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReviewLog(log)}
                            className="text-xs font-medium text-slate-600 hover:text-slate-900 hover:underline"
                          >
                            Inspect
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin Review Modal */}
      <Modal
        open={Boolean(reviewLog)}
        onClose={() => setReviewLog(null)}
        title={
          reviewLog
            ? `Audit Log #${reviewLog.LogID} · ${reviewLog.ActionType} ${reviewLog.AffectedTable}`
            : 'Audit Log Review'
        }
        subtitle={
          reviewLog
            ? `Submitted by ${reviewLog.TeacherName || reviewLog.AdminName || 'Faculty'} on ${reviewLog.Timestamp}`
            : undefined
        }
        maxWidth="md"
      >
        {reviewLog && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Operation</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-900">
                  {reviewLog.ActionType} · {reviewLog.AffectedTable} #{reviewLog.AffectedRecordID}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Current Status</div>
                <div className="mt-0.5">
                  <StatusText status={reviewLog.Status} />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-medium text-slate-500">Documented Reason</div>
              <p className="mt-1 text-sm font-medium text-slate-900">{reviewLog.Reason}</p>
            </div>

            {reviewLog.Status === 'Pending' ? (
              <>
                <p className="text-xs text-slate-500">
                  Rejecting a Student deletion automatically restores the archived student to Active status; approving finalizes the action.
                </p>

                <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => handleReviewDecision('Rejected')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    <span>Reject Action</span>
                  </button>
                  <button
                    type="button"
                    disabled={reviewing}
                    onClick={() => handleReviewDecision('Approved')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Approve Action</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-xs text-slate-600">
                <div>
                  Reviewed by{' '}
                  <span className="font-semibold text-slate-900">
                    {reviewLog.AdminName || 'System'}
                  </span>
                </div>
                <StatusText status={reviewLog.Status} />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Admin Global Log Maintenance Modal */}
      <Modal
        open={maintOpen}
        onClose={() => setMaintOpen(false)}
        title="Audit Log Maintenance"
        subtitle="Configure retention threshold and prune resolved log entries after reaching capacity."
      >
        {maintenance && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-lg border border-slate-200 p-4">
              <div>
                <div className="text-xs text-slate-500">Total Logs</div>
                <div className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
                  {maintenance.totalLogs}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pending (Kept)</div>
                <div className="mt-1 font-mono text-lg font-semibold text-amber-700 tabular-nums">
                  {maintenance.pendingCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Resolved</div>
                <div className="mt-1 font-mono text-lg font-semibold text-slate-800 tabular-nums">
                  {maintenance.resolvedCount}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Auth / System</div>
                <div className="mt-1 font-mono text-lg font-semibold text-slate-600 tabular-nums">
                  {maintenance.systemEventCount}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="maint-threshold" className="block text-sm font-medium text-slate-700">
                  Max Log Size Threshold
                </label>
                <div className="mt-1.5 flex items-center gap-3">
                  <input
                    id="maint-threshold"
                    type="number"
                    min="10"
                    max="5000"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleMaintenanceAction('update_settings')}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                  >
                    Save Threshold
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-2.5">
              <div className="text-sm font-semibold text-slate-900">Manual Log Cleanup</div>
              <p className="text-xs text-slate-500">
                Pending audit reviews are never removed during cleanup.
              </p>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleMaintenanceAction('prune_system_events')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>Clear Login &amp; System Events</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleMaintenanceAction('prune_resolved')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Prune Resolved Logs (Keep Latest 10)</span>
                </button>
              </div>
            </div>

            {maintMsg && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                {maintMsg}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
