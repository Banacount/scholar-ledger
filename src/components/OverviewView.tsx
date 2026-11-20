import { ArrowRight } from 'lucide-react';
import type { DashboardSummary } from '../types.ts';
import { StatusText } from './StatusText.tsx';

interface OverviewViewProps {
  data: DashboardSummary | null;
  loading: boolean;
  onNavigate: (tab: string, sectionId?: number) => void;
}

export function OverviewView({ data, loading, onNavigate }: OverviewViewProps) {
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  const isAdmin = data.role === 'admin';
  const kpis = isAdmin
    ? [
        { label: 'Pending Reviews', value: data.metrics.pendingReviews, note: 'Awaiting decision', target: 'logs' },
        { label: 'Active Sections', value: data.metrics.sections, note: `Across ${data.metrics.courses} courses`, target: 'sections' },
        { label: 'Enrolled Students', value: data.metrics.students, note: `${data.metrics.teachers} faculty members`, target: 'students' },
        {
          label: 'Audit Log Usage',
          value: `${data.metrics.totalLogs} / ${data.metrics.logThreshold}`,
          note: data.metrics.totalLogs >= data.metrics.logThreshold ? 'Maintenance recommended' : 'Within log capacity',
          target: 'logs',
        },
      ]
    : [
        { label: 'Handled Sections', value: data.metrics.sections, note: 'Assigned cohorts', target: 'sections' },
        { label: 'My Students', value: data.metrics.students, note: 'Active roster', target: 'students' },
        { label: 'Recorded Scores', value: data.metrics.scores, note: 'Graded assessments', target: 'gradebook' },
        { label: 'Pending Audit Items', value: data.metrics.pendingReviews, note: 'In admin review queue', target: 'logs' },
      ];

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => onNavigate(kpi.target)}
            className="text-left rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <div className="text-xs font-medium text-slate-500">{kpi.label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
              {kpi.value}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
              <span>{kpi.note}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </button>
        ))}
      </div>

      {/* Main Content Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Section Roster & Grade Averages */}
        <div className="xl:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isAdmin ? 'Institution Section Summary' : 'Your Handled Sections'}
              </h2>
              <p className="text-xs text-slate-500">
                Click any section to view enrolled students
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('sections')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap shrink-0"
            >
              Manage sections
            </button>
          </div>

          {data.sectionSummaries.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-slate-600">No sections assigned yet.</p>
              <button
                type="button"
                onClick={() => onNavigate('sections')}
                className="mt-3 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
              >
                Create First Section
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="px-5 py-2.5">Section</th>
                    <th className="px-4 py-2.5">Course</th>
                    <th className="px-4 py-2.5 text-right">Students</th>
                    <th className="px-4 py-2.5 text-right">Avg Score</th>
                    <th className="px-5 py-2.5 text-right">Absences</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.sectionSummaries.map((sec) => (
                    <tr
                      key={sec.SectionID}
                      onClick={() => onNavigate('students', sec.SectionID)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {sec.SectionName}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {sec.CourseName}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {sec.student_count}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {sec.avg_grade_pct !== null ? `${sec.avg_grade_pct}%` : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-600">
                        {sec.absences_count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Accountability Activity */}
        <div className="xl:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {isAdmin ? 'Flagged Actions Queue' : 'Recent Reason Logs'}
              </h2>
              <p className="text-xs text-slate-500">
                {isAdmin ? 'Pending & recent teacher record changes' : 'Administrative review status of your actions'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('logs')}
              className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline whitespace-nowrap shrink-0"
            >
              {isAdmin ? 'Open review queue' : 'View full log'}
            </button>
          </div>

          {data.recentLogs.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No recent action logs recorded.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentLogs.map((log) => (
                <li key={log.LogID} className="px-5 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-700">
                          {log.ActionType}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{log.AffectedTable} #{log.AffectedRecordID}</span>
                        {isAdmin && log.TeacherName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{log.TeacherName}</span>
                          </>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-800 line-clamp-1">
                        {log.Reason}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <StatusText status={log.Status} />
                    </div>
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-slate-400 tabular-nums">
                    {log.Timestamp}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
