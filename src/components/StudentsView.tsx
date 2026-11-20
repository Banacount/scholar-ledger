import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest, downloadCsv } from '../lib/api.ts';
import type { AuthUser, Section, Student, StudentScore } from '../types.ts';
import { Modal, ReasonConfirmModal } from './Modal.tsx';
import { StatusText } from './StatusText.tsx';

interface StudentsViewProps {
  user: AuthUser;
  initialSectionId?: number | null;
  onOpenGradebookForStudent: (studentId: number, sectionId: number) => void;
  onDataChanged: () => void;
}

export function StudentsView({
  initialSectionId,
  onOpenGradebookForStudent,
  onDataChanged,
}: StudentsViewProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sectionFilter, setSectionFilter] = useState<string>(
    initialSectionId ? String(initialSectionId) : 'all'
  );
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('Name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (initialSectionId) {
      setSectionFilter(String(initialSectionId));
    }
  }, [initialSectionId]);

  // Add/Edit Student Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sectionId, setSectionId] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Student Modal
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);

  // Student Detail Modal
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [detailScores, setDetailScores] = useState<StudentScore[]>([]);
  const [loadingGrades, setLoadingGrades] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sortBy,
        sortDir,
        sectionId: sectionFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const [studentRows, sectionRows] = await Promise.all([
        apiRequest<Student[]>(`/api/students?${params.toString()}`),
        apiRequest<Section[]>('/api/sections'),
      ]);
      setStudents(studentRows);
      setSections(sectionRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir, sectionFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const openCreateModal = () => {
    setEditingStudent(null);
    setName('');
    setEmail('');
    setSectionId(
      sectionFilter !== 'all'
        ? Number(sectionFilter)
        : sections[0]?.SectionID || 0
    );
    setReason('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (st: Student) => {
    setEditingStudent(st);
    setName(st.Name);
    setEmail(st.Email || '');
    setSectionId(st.SectionID);
    setReason('');
    setFormError(null);
    setFormOpen(true);
  };

  const openDetailModal = async (st: Student) => {
    setDetailStudent(st);
    setLoadingGrades(true);
    try {
      const scores = await apiRequest<StudentScore[]>(`/api/scores?studentId=${st.StudentID}`);
      setDetailScores(scores);
    } catch {
      setDetailScores([]);
    } finally {
      setLoadingGrades(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionId) {
      setFormError('Please select a section first.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingStudent) {
        await apiRequest(`/api/students/${editingStudent.StudentID}`, {
          method: 'PUT',
          body: JSON.stringify({
            name,
            email: email.trim() || undefined,
            sectionId,
            status: editingStudent.Status,
            reason: reason.trim() || undefined,
          }),
        });
      } else {
        await apiRequest('/api/students', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email: email.trim() || undefined,
            sectionId,
            reason: reason.trim() || undefined,
          }),
        });
      }
      setFormOpen(false);
      await loadData();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save student.');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      'students-roster.csv',
      ['Student ID', 'Name', 'Email', 'Section', 'Course', 'Status', 'Avg %', 'Absences'],
      students.map((s) => [
        s.StudentID,
        s.Name,
        s.Email || '',
        s.SectionName || '',
        s.CourseName || '',
        s.Status,
        s.avg_percentage ?? '',
        s.absences_count ?? 0,
      ])
    );
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, section..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            aria-label="Filter by section"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="all">All Sections</option>
            {sections.map((sec) => (
              <option key={sec.SectionID} value={sec.SectionID}>
                {sec.SectionName} ({sec.CourseName})
              </option>
            ))}
          </select>

          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [col, dir] = e.target.value.split(':');
              setSortBy(col);
              setSortDir(dir as 'asc' | 'desc');
            }}
            aria-label="Sort students"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="Name:asc">Sort: Name (A–Z)</option>
            <option value="Name:desc">Sort: Name (Z–A)</option>
            <option value="StudentID:asc">Sort: Student ID (Asc)</option>
            <option value="SectionName:asc">Sort: Section</option>
            <option value="avg_percentage:desc">Sort: Highest Average</option>
            <option value="absences_count:desc">Sort: Most Absences</option>
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={students.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={openCreateModal}
            disabled={sections.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">No students found</p>
            <p className="mt-1 text-xs text-slate-500">
              {sections.length === 0
                ? 'Create a section first before enrolling students.'
                : 'Add a student into one of your sections or clear active filters.'}
            </p>
            {sections.length > 0 && (
              <button
                type="button"
                onClick={openCreateModal}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add First Student</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('StudentID')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>ID</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('Name')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>Student Name</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('SectionName')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>Section</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('avg_percentage')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>Avg Score</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('absences_count')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>Absences</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((st) => (
                  <tr key={st.StudentID} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                      #{st.StudentID}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openDetailModal(st)}
                        className="text-left group"
                      >
                        <div className="font-medium text-slate-900 group-hover:text-blue-700 group-hover:underline">
                          {st.Name}
                        </div>
                        <div className="text-xs text-slate-500">{st.Email || 'No email on file'}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-slate-800">{st.SectionName}</span>
                      <span className="ml-1.5 text-xs text-slate-400">
                        {st.CourseName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusText status={st.Status === 'Active' ? 'Approved' : st.Status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                      {st.avg_percentage !== null && st.avg_percentage !== undefined
                        ? `${st.avg_percentage}%`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {st.absences_count ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenGradebookForStudent(st.StudentID, st.SectionID)}
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                        >
                          <GraduationCap className="h-3.5 w-3.5" />
                          <span>Scores</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(st)}
                          aria-label={`Edit ${st.Name}`}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingStudent(st)}
                          aria-label={`Delete ${st.Name}`}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
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

      {/* Add / Edit Student Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          editingStudent
            ? `Edit Student · ${editingStudent.Name}`
            : 'Add Student to Section'
        }
        subtitle="Students belong to a section handled by their assigned teacher."
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div>
            <label htmlFor="stu-name" className="block text-sm font-medium text-slate-700">
              Full Name
            </label>
            <input
              id="stu-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Alyssa Cabrera"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="stu-email" className="block text-sm font-medium text-slate-700">
                Student Email <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="stu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@student.sample.ph"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div>
              <label htmlFor="stu-sec" className="block text-sm font-medium text-slate-700">
                Assigned Section
              </label>
              <select
                id="stu-sec"
                value={sectionId}
                onChange={(e) => setSectionId(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                {sections.map((sec) => (
                  <option key={sec.SectionID} value={sec.SectionID}>
                    {sec.SectionName} ({sec.CourseName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="stu-reason" className="block text-sm font-medium text-slate-700">
              Audit Note / Reason <span className="text-slate-400 font-normal">(optional for review log)</span>
            </label>
            <input
              id="stu-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                editingStudent
                  ? 'e.g., Fix spelling or match registrar roster'
                  : 'e.g., Late enrollee'
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingStudent ? 'Save Changes' : 'Enroll Student'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Student Profile & Scores Quick View Modal */}
      <Modal
        open={Boolean(detailStudent)}
        onClose={() => setDetailStudent(null)}
        title={detailStudent ? detailStudent.Name : 'Student Profile'}
        subtitle={
          detailStudent
            ? `Student #${detailStudent.StudentID} · ${detailStudent.SectionName} (${detailStudent.CourseName})`
            : undefined
        }
        maxWidth="lg"
      >
        {detailStudent && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-b border-slate-200 pb-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Email</div>
                <div className="mt-0.5 font-medium text-slate-900 truncate">
                  {detailStudent.Email || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Status</div>
                <div className="mt-0.5 font-medium text-slate-900">{detailStudent.Status}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Average Score</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                  {detailStudent.avg_percentage !== null && detailStudent.avg_percentage !== undefined
                    ? `${detailStudent.avg_percentage}%`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Total Absences</div>
                <div className="mt-0.5 font-mono font-semibold text-slate-900 tabular-nums">
                  {detailStudent.absences_count ?? 0}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">Recorded Assessment Scores</h3>
                <button
                  type="button"
                  onClick={() => {
                    const st = detailStudent;
                    setDetailStudent(null);
                    onOpenGradebookForStudent(st.StudentID, st.SectionID);
                  }}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Open in Gradebook
                </button>
              </div>

              {loadingGrades ? (
                <div className="h-24 rounded-lg bg-slate-100 animate-pulse" />
              ) : detailScores.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                  No scores recorded for this student yet.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <th className="px-3.5 py-2">Subject</th>
                        <th className="px-3.5 py-2">Assessment</th>
                        <th className="px-3.5 py-2 text-right">Score</th>
                        <th className="px-3.5 py-2">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailScores.map((g) => (
                        <tr key={g.ScoreID}>
                          <td className="px-3.5 py-2 font-medium text-slate-900">{g.SubjectName}</td>
                          <td className="px-3.5 py-2 text-xs text-slate-600">
                            {g.AssessmentTitle} ({g.AssessmentType})
                          </td>
                          <td className="px-3.5 py-2 text-right font-mono tabular-nums text-slate-800">
                            {g.Score} / {g.MaxScore}
                          </td>
                          <td className="px-3.5 py-2 text-xs text-slate-600">
                            {g.Remarks || '—'}
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
      </Modal>

      {/* Mandatory Reason Delete Modal */}
      <ReasonConfirmModal
        open={Boolean(deletingStudent)}
        onClose={() => setDeletingStudent(null)}
        title={
          deletingStudent
            ? `Delete Student · ${deletingStudent.Name}`
            : 'Delete Student'
        }
        description="Deleting a student archives them from the active roster and creates a Pending deletion entry for Administrator review. If rejected by an Administrator, the student record is restored to Active."
        confirmLabel="Submit Student Deletion"
        onConfirm={async (deleteReason) => {
          if (!deletingStudent) return;
          await apiRequest(`/api/students/${deletingStudent.StudentID}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason: deleteReason }),
          });
          await loadData();
          onDataChanged();
        }}
      />
    </div>
  );
}
