import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpDown,
  Check,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { apiRequest, downloadCsv } from '../lib/api.ts';
import type {
  Assessment,
  AssessmentType,
  AttendanceRecord,
  AttendanceStatus,
  AuthUser,
  Section,
  SectionSubject,
  Student,
  StudentScore,
  Subject,
} from '../types.ts';
import { Modal, ReasonConfirmModal } from './Modal.tsx';

interface GradebookViewProps {
  user: AuthUser;
  initialSubTab?: 'scores' | 'assessments' | 'attendance';
  onSubTabChange?: (subTab: 'scores' | 'assessments' | 'attendance') => void;
  initialSectionId?: number | null;
  initialStudentId?: number | null;
  onDataChanged: () => void;
}

export function GradebookView({
  user,
  initialSubTab = 'scores',
  onSubTabChange,
  initialSectionId,
  initialStudentId,
  onDataChanged,
}: GradebookViewProps) {
  const [subTab, setSubTab] = useState<'scores' | 'assessments' | 'attendance'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleSetSubTab = (next: 'scores' | 'assessments' | 'attendance') => {
    setSubTab(next);
    onSubTabChange?.(next);
  };

  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([]);

  // Student Scores Ledger state
  const [scores, setScores] = useState<StudentScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string>(
    initialSectionId ? String(initialSectionId) : 'all'
  );
  const [studentFilter, setStudentFilter] = useState<string>(
    initialStudentId ? String(initialStudentId) : 'all'
  );
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('StudentName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  useEffect(() => {
    if (initialSectionId) setSectionFilter(String(initialSectionId));
    if (initialStudentId) setStudentFilter(String(initialStudentId));
  }, [initialSectionId, initialStudentId]);

  // Add/Edit Score Modal
  const [scoreFormOpen, setScoreFormOpen] = useState(false);
  const [editingScore, setEditingScore] = useState<StudentScore | null>(null);
  const [formStudentId, setFormStudentId] = useState<number>(0);
  const [formAssessmentId, setFormAssessmentId] = useState<number>(0);
  const [formScoreVal, setFormScoreVal] = useState('');
  const [formRemarks, setFormRemarks] = useState('');
  const [formReason, setFormReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Score Modal
  const [deletingScore, setDeletingScore] = useState<StudentScore | null>(null);

  // Assessments state
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<Assessment | null>(null);
  const [assessmentScores, setAssessmentScores] = useState<StudentScore[]>([]);
  const [newAssessmentOpen, setNewAssessmentOpen] = useState(false);
  const [assSubjectId, setAssSubjectId] = useState<number>(0);
  const [assTitle, setAssTitle] = useState('');
  const [assType, setAssType] = useState<AssessmentType>('Quiz');
  const [assMaxScore, setAssMaxScore] = useState('50');
  const [assReason, setAssReason] = useState('');

  // Quick Score Entry inside Assessment panel
  const [quickStudent, setQuickStudent] = useState<Student | null>(null);
  const [quickScoreVal, setQuickScoreVal] = useState('');
  const [quickRemarks, setQuickRemarks] = useState('');
  const [quickReason, setQuickReason] = useState('');
  const [quickError, setQuickError] = useState<string | null>(null);

  // Attendance state
  const [attSectionId, setAttSectionId] = useState<number>(0);
  const [attSubjectId, setAttSubjectId] = useState<number>(0);
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRecord[]>([]);
  const [attSavedMsg, setAttSavedMsg] = useState<string | null>(null);

  const loadBaseData = useCallback(async () => {
    try {
      const [secRows, stuRows, subjRows, ssRows, assRows] = await Promise.all([
        apiRequest<Section[]>('/api/sections'),
        apiRequest<Student[]>('/api/students'),
        apiRequest<Subject[]>('/api/subjects'),
        apiRequest<SectionSubject[]>('/api/section-subjects'),
        apiRequest<Assessment[]>('/api/assessments'),
      ]);
      setSections(secRows);
      setStudents(stuRows);
      setSubjects(subjRows);
      setSectionSubjects(ssRows);
      setAssessments(assRows);

      if (secRows.length > 0) {
        setAttSectionId((prev) => prev || secRows[0].SectionID);
      }
      if (subjRows.length > 0) {
        setAssSubjectId((prev) => prev || subjRows[0].SubjectID);
        setAttSubjectId((prev) => prev || subjRows[0].SubjectID);
      }
      if (assRows.length > 0) {
        setSelectedAssessment((prev) => {
          if (prev && assRows.some((r) => r.AssessmentID === prev.AssessmentID)) {
            return assRows.find((r) => r.AssessmentID === prev.AssessmentID) || assRows[0];
          }
          return assRows[0];
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog.');
    }
  }, []);

  const loadScores = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sortBy,
        sortDir,
        sectionId: sectionFilter,
        studentId: studentFilter,
        subjectId: subjectFilter,
      });
      if (search.trim()) params.set('search', search.trim());
      const rows = await apiRequest<StudentScore[]>(`/api/scores?${params.toString()}`);
      setScores(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scores.');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir, sectionFilter, studentFilter, subjectFilter, search]);

  const loadAssessments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (subjectFilter !== 'all') params.set('subjectId', subjectFilter);
      const rows = await apiRequest<Assessment[]>(`/api/assessments?${params.toString()}`);
      setAssessments(rows);
      if (rows.length > 0) {
        setSelectedAssessment((prev) => {
          if (prev && rows.some((r) => r.AssessmentID === prev.AssessmentID)) {
            return rows.find((r) => r.AssessmentID === prev.AssessmentID) || rows[0];
          }
          return rows[0];
        });
      } else {
        setSelectedAssessment(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assessments.');
    }
  }, [subjectFilter]);

  const loadScoresForSelected = useCallback(async () => {
    if (!selectedAssessment) {
      setAssessmentScores([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        assessmentId: String(selectedAssessment.AssessmentID),
        sectionId: sectionFilter,
      });
      const rows = await apiRequest<StudentScore[]>(`/api/scores?${params.toString()}`);
      setAssessmentScores(rows);
    } catch {
      setAssessmentScores([]);
    }
  }, [selectedAssessment, sectionFilter]);

  const loadAttendance = useCallback(async () => {
    if (!attSectionId || !attSubjectId) {
      setAttendanceRows([]);
      return;
    }
    try {
      const rows = await apiRequest<AttendanceRecord[]>(
        `/api/attendance?sectionId=${attSectionId}&subjectId=${attSubjectId}&date=${attDate}`
      );
      setAttendanceRows(rows);
    } catch {
      setAttendanceRows([]);
    }
  }, [attSectionId, attSubjectId, attDate]);

  useEffect(() => {
    loadBaseData();
  }, [loadBaseData]);

  // Keep attendance subject synced with selected section's SectionSubjects when possible
  useEffect(() => {
    if (!attSectionId) return;
    const matching = sectionSubjects.filter((ss) => ss.SectionID === attSectionId);
    if (matching.length > 0 && !matching.some((m) => m.SubjectID === attSubjectId)) {
      setAttSubjectId(matching[0].SubjectID);
    }
  }, [attSectionId, sectionSubjects, attSubjectId]);

  useEffect(() => {
    if (subTab === 'scores') loadScores();
    if (subTab === 'assessments') loadAssessments();
    if (subTab === 'attendance') loadAttendance();
  }, [subTab, loadScores, loadAssessments, loadAttendance]);

  useEffect(() => {
    if (subTab === 'assessments') loadScoresForSelected();
  }, [subTab, selectedAssessment, loadScoresForSelected]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const openCreateScoreModal = () => {
    setEditingScore(null);
    const defaultStu =
      studentFilter !== 'all'
        ? Number(studentFilter)
        : students.find((s) => sectionFilter === 'all' || String(s.SectionID) === sectionFilter)
            ?.StudentID || students[0]?.StudentID || 0;
    setFormStudentId(defaultStu);
    setFormAssessmentId(assessments[0]?.AssessmentID || 0);
    setFormScoreVal('');
    setFormRemarks('');
    setFormReason('');
    setFormError(null);
    setScoreFormOpen(true);
  };

  const openEditScoreModal = (item: StudentScore) => {
    setEditingScore(item);
    setFormStudentId(item.StudentID);
    setFormAssessmentId(item.AssessmentID);
    setFormScoreVal(String(item.Score));
    setFormRemarks(item.Remarks || '');
    setFormReason('');
    setFormError(null);
    setScoreFormOpen(true);
  };

  const handleSaveScoreModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingScore && user.role === 'teacher' && formReason.trim().length < 3) {
      setFormError('A reason (at least 3 characters) is required when editing a score.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingScore) {
        await apiRequest(`/api/scores/${editingScore.ScoreID}`, {
          method: 'PUT',
          body: JSON.stringify({
            score: Number(formScoreVal),
            remarks: formRemarks.trim() || undefined,
            reason: formReason.trim() || undefined,
          }),
        });
      } else {
        await apiRequest('/api/scores', {
          method: 'POST',
          body: JSON.stringify({
            assessmentId: formAssessmentId,
            studentId: formStudentId,
            score: Number(formScoreVal),
            remarks: formRemarks.trim() || undefined,
            reason: formReason.trim() || undefined,
          }),
        });
      }
      setScoreFormOpen(false);
      await loadScores();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save score.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/assessments', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: assSubjectId,
          title: assTitle,
          assessmentType: assType,
          maxScore: Number(assMaxScore),
          reason: assReason.trim() || undefined,
        }),
      });
      setNewAssessmentOpen(false);
      setAssTitle('');
      setAssReason('');
      await loadAssessments();
      await loadBaseData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create assessment.');
    }
  };

  const handleSaveQuickScore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssessment || !quickStudent) return;
    const existing = assessmentScores.find((sc) => sc.StudentID === quickStudent.StudentID);
    if (existing && user.role === 'teacher' && quickReason.trim().length < 3) {
      setQuickError('A reason (at least 3 characters) is required when modifying an existing score.');
      return;
    }
    setQuickError(null);
    try {
      await apiRequest('/api/scores', {
        method: 'POST',
        body: JSON.stringify({
          assessmentId: selectedAssessment.AssessmentID,
          studentId: quickStudent.StudentID,
          score: Number(quickScoreVal),
          remarks: quickRemarks.trim() || undefined,
          reason: quickReason.trim() || undefined,
        }),
      });
      setQuickStudent(null);
      await loadScoresForSelected();
      await loadAssessments();
      onDataChanged();
    } catch (err) {
      setQuickError(err instanceof Error ? err.message : 'Unable to save score.');
    }
  };

  const handleSaveAttendance = async () => {
    if (!attSectionId || !attSubjectId) return;
    setAttSavedMsg(null);
    setError(null);
    try {
      await apiRequest('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({
          sectionId: attSectionId,
          subjectId: attSubjectId,
          date: attDate,
          records: attendanceRows.map((r) => ({
            studentId: r.StudentID,
            status: r.Status,
          })),
        }),
      });
      setAttSavedMsg(`Attendance saved for ${attDate}.`);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save attendance.');
    }
  };

  const handleExportScores = () => {
    downloadCsv(
      'student-scores.csv',
      ['Student', 'Section', 'Subject', 'Assessment', 'Type', 'Score', 'Max Score', 'Percentage', 'Remarks'],
      scores.map((g) => {
        const max = g.MaxScore || 100;
        return [
          g.StudentName || '',
          g.SectionName || '',
          g.SubjectName || '',
          g.AssessmentTitle || '',
          g.AssessmentType || '',
          g.Score,
          max,
          `${((g.Score / max) * 100).toFixed(1)}%`,
          g.Remarks || '',
        ];
      })
    );
  };

  const availableSubjectsForAttendance = (() => {
    const mapped = sectionSubjects.filter((ss) => ss.SectionID === attSectionId);
    if (mapped.length > 0) {
      const uniqueIds = new Set(mapped.map((m) => m.SubjectID));
      return subjects.filter((s) => uniqueIds.has(s.SubjectID));
    }
    return subjects;
  })();

  const eligibleStudentsForAssessment = students.filter(
    (s) => sectionFilter === 'all' || String(s.SectionID) === sectionFilter
  );

  return (
    <div className="space-y-4">
      {/* Segmented View Switcher + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
          <button
            type="button"
            onClick={() => handleSetSubTab('scores')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'scores'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Student Scores
          </button>
          <button
            type="button"
            onClick={() => handleSetSubTab('assessments')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'assessments'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Assessments
          </button>
          <button
            type="button"
            onClick={() => handleSetSubTab('attendance')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              subTab === 'attendance'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Attendance Log
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab !== 'attendance' && (
            <select
              value={sectionFilter}
              onChange={(e) => {
                setSectionFilter(e.target.value);
                setStudentFilter('all');
              }}
              aria-label="Filter by section"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All Sections</option>
              {sections.map((sec) => (
                <option key={sec.SectionID} value={sec.SectionID}>
                  {sec.SectionName} ({sec.CourseName})
                </option>
              ))}
            </select>
          )}

          {subTab === 'scores' && (
            <>
              <button
                type="button"
                onClick={handleExportScores}
                disabled={scores.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Download className="h-4 w-4" />
                <span>Export CSV</span>
              </button>
              <button
                type="button"
                onClick={openCreateScoreModal}
                disabled={students.length === 0 || assessments.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" />
                <span>Record Score</span>
              </button>
            </>
          )}

          {subTab === 'assessments' && (
            <button
              type="button"
              onClick={() => setNewAssessmentOpen(true)}
              disabled={subjects.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>New Assessment</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* SUB-TAB 1: STUDENT SCORES LEDGER */}
      {subTab === 'scores' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student, subject, assessment..."
                className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              aria-label="Filter by subject"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All Subjects</option>
              {subjects.map((sub) => (
                <option key={sub.SubjectID} value={sub.SubjectID}>
                  {sub.SubjectName}
                </option>
              ))}
            </select>

            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              aria-label="Filter by student"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="all">All Students</option>
              {students
                .filter((s) => sectionFilter === 'all' || String(s.SectionID) === sectionFilter)
                .map((s) => (
                  <option key={s.StudentID} value={s.StudentID}>
                    {s.Name} ({s.SectionName})
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
              aria-label="Sort scores"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
            >
              <option value="StudentName:asc">Sort: Student (A–Z)</option>
              <option value="SubjectName:asc">Sort: Subject (A–Z)</option>
              <option value="AssessmentTitle:asc">Sort: Assessment (A–Z)</option>
              <option value="percentage:desc">Sort: Highest %</option>
              <option value="percentage:asc">Sort: Lowest %</option>
            </select>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {loading ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : scores.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-slate-800">No student scores recorded</p>
                <p className="mt-1 text-xs text-slate-500">
                  Record a student score under an existing assessment or adjust your filters.
                </p>
                {students.length > 0 && assessments.length > 0 && (
                  <button
                    type="button"
                    onClick={openCreateScoreModal}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Record Score</span>
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
                          onClick={() => toggleSort('StudentName')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          <span>Student</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSort('SubjectName')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          <span>Subject</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSort('AssessmentTitle')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          <span>Assessment</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleSort('Score')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          <span>Score</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => toggleSort('percentage')}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          <span>Pct</span>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="px-4 py-3">Remarks</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scores.map((item) => {
                      const max = Number(item.MaxScore || 100);
                      const pct = max > 0 ? Math.round((Number(item.Score) / max) * 1000) / 10 : 0;
                      return (
                        <tr key={item.ScoreID} className="transition-colors hover:bg-slate-50">
                          <td className="px-5 py-3 whitespace-nowrap">
                            <div className="font-medium text-slate-900">{item.StudentName}</div>
                            <div className="text-xs text-slate-500">
                              {item.SectionName} · <span className="font-mono">#{item.StudentID}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">{item.SubjectName}</td>
                          <td className="px-4 py-3">
                            <div className="text-slate-900">{item.AssessmentTitle}</div>
                            <div className="text-xs text-slate-500">{item.AssessmentType}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                            {item.Score} / {max}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                            {pct}%
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">
                            {item.Remarks || '—'}
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEditScoreModal(item)}
                                aria-label={`Edit score for ${item.StudentName}`}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingScore(item)}
                                aria-label={`Delete score for ${item.StudentName}`}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: ASSESSMENTS & QUICK GRADING */}
      {subTab === 'assessments' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-slate-900">Evaluative Assessments</h2>
              <p className="text-xs text-slate-500">Select an assessment to grade enrolled students</p>
            </div>
            {assessments.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No assessments created yet. Click &ldquo;New Assessment&rdquo; to add one.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {assessments.map((ass) => {
                  const active = selectedAssessment?.AssessmentID === ass.AssessmentID;
                  return (
                    <li key={ass.AssessmentID}>
                      <button
                        type="button"
                        onClick={() => setSelectedAssessment(ass)}
                        className={`w-full text-left px-5 py-3.5 transition-colors ${
                          active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {ass.Title}
                          </span>
                          <span className="font-mono text-xs text-slate-500 shrink-0 tabular-nums">
                            Max {ass.MaxScore}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>{ass.AssessmentType}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{ass.SubjectName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{ass.graded_count ?? 0} graded</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {selectedAssessment ? selectedAssessment.Title : 'Student Scores'}
                </h2>
                <p className="text-xs text-slate-500">
                  {selectedAssessment
                    ? `${selectedAssessment.SubjectName} · ${selectedAssessment.AssessmentType} · Max Score: ${selectedAssessment.MaxScore}`
                    : 'Choose an assessment from the list'}
                </p>
              </div>
            </div>

            {!selectedAssessment ? (
              <div className="px-5 py-12 text-center text-sm text-slate-500">
                Select an assessment to view and record student scores.
              </div>
            ) : eligibleStudentsForAssessment.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-slate-500">
                No active students match the selected section filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                      <th className="px-5 py-2.5">Student</th>
                      <th className="px-4 py-2.5 text-right">Score</th>
                      <th className="px-4 py-2.5">Remarks</th>
                      <th className="px-5 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {eligibleStudentsForAssessment.map((st) => {
                      const existing = assessmentScores.find((sc) => sc.StudentID === st.StudentID);
                      return (
                        <tr key={st.StudentID} className="hover:bg-slate-50">
                          <td className="px-5 py-3">
                            <div className="font-medium text-slate-900">{st.Name}</div>
                            <div className="text-xs text-slate-500">
                              {st.SectionName} · <span className="font-mono">#{st.StudentID}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                            {existing ? `${existing.Score} / ${selectedAssessment.MaxScore}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {existing?.Remarks || '—'}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setQuickStudent(st);
                                setQuickScoreVal(existing ? String(existing.Score) : '');
                                setQuickRemarks(existing?.Remarks || '');
                                setQuickReason('');
                                setQuickError(null);
                              }}
                              className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
                            >
                              {existing ? 'Edit Score' : 'Record Score'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: ATTENDANCE LOG */}
      {subTab === 'attendance' && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
              <select
                value={attSectionId}
                onChange={(e) => setAttSectionId(Number(e.target.value))}
                aria-label="Select section"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                {sections.map((sec) => (
                  <option key={sec.SectionID} value={sec.SectionID}>
                    {sec.SectionName} ({sec.CourseName})
                  </option>
                ))}
              </select>

              <select
                value={attSubjectId}
                onChange={(e) => setAttSubjectId(Number(e.target.value))}
                aria-label="Select subject"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:outline-none"
              >
                {availableSubjectsForAttendance.map((sub) => (
                  <option key={sub.SubjectID} value={sub.SubjectID}>
                    {sub.SubjectName}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-800 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              {attSavedMsg && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <Check className="h-3.5 w-3.5" />
                  <span>{attSavedMsg}</span>
                </span>
              )}
              <button
                type="button"
                onClick={handleSaveAttendance}
                disabled={attendanceRows.length === 0}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Save Attendance
              </button>
            </div>
          </div>

          {attendanceRows.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No active students enrolled in this section yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="px-5 py-3">Student ID</th>
                    <th className="px-4 py-3">Student Name</th>
                    <th className="px-5 py-3 text-right">Session Presence Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceRows.map((row) => (
                    <tr key={row.StudentID} className="hover:bg-slate-50">
                      <td className="px-5 py-3 font-mono text-xs text-slate-600 tabular-nums">
                        #{row.StudentID}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {row.StudentName}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                          {(['Present', 'Absent', 'Late', 'Excused'] as AttendanceStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => {
                                setAttSavedMsg(null);
                                setAttendanceRows((prev) =>
                                  prev.map((r) =>
                                    r.StudentID === row.StudentID ? { ...r, Status: st } : r
                                  )
                                );
                              }}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                                row.Status === st
                                  ? st === 'Absent'
                                    ? 'bg-red-600 text-white'
                                    : st === 'Late'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-white text-slate-900 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Score Modal */}
      <Modal
        open={scoreFormOpen}
        onClose={() => setScoreFormOpen(false)}
        title={editingScore ? `Edit Score · ${editingScore.StudentName}` : 'Record Student Score'}
        subtitle={
          editingScore
            ? 'Editing an existing score requires an audit reason for Administrative review.'
            : 'Record a student score under an assessment.'
        }
      >
        <form onSubmit={handleSaveScoreModal} className="space-y-4">
          {!editingScore && (
            <>
              <div>
                <label htmlFor="sc-student" className="block text-sm font-medium text-slate-700">
                  Student
                </label>
                <select
                  id="sc-student"
                  value={formStudentId}
                  onChange={(e) => setFormStudentId(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {students.map((s) => (
                    <option key={s.StudentID} value={s.StudentID}>
                      {s.Name} — {s.SectionName} (#{s.StudentID})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="sc-assessment" className="block text-sm font-medium text-slate-700">
                  Assessment
                </label>
                <select
                  id="sc-assessment"
                  value={formAssessmentId}
                  onChange={(e) => setFormAssessmentId(Number(e.target.value))}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {assessments.map((a) => (
                    <option key={a.AssessmentID} value={a.AssessmentID}>
                      {a.Title} · {a.SubjectName} (Max {a.MaxScore})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sc-val" className="block text-sm font-medium text-slate-700">
                Score
              </label>
              <input
                id="sc-val"
                type="number"
                step="0.01"
                min="0"
                required
                value={formScoreVal}
                onChange={(e) => setFormScoreVal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="sc-rem" className="block text-sm font-medium text-slate-700">
                Remarks <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="sc-rem"
                type="text"
                value={formRemarks}
                onChange={(e) => setFormRemarks(e.target.value)}
                placeholder="e.g., Passed, Exempt, Recheck"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="sc-reason" className="block text-sm font-medium text-slate-700">
              Audit Reason{' '}
              {editingScore && user.role === 'teacher' ? (
                <span className="text-red-600">*</span>
              ) : (
                <span className="text-slate-400 font-normal">(optional)</span>
              )}
            </label>
            <input
              id="sc-reason"
              type="text"
              required={Boolean(editingScore && user.role === 'teacher')}
              value={formReason}
              onChange={(e) => setFormReason(e.target.value)}
              placeholder={
                editingScore
                  ? 'e.g., Recomputed partial credit on item 4'
                  : 'e.g., Initial grading entry'
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
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
              onClick={() => setScoreFormOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingScore ? 'Save Score Change' : 'Save Score'}
            </button>
          </div>
        </form>
      </Modal>

      {/* New Assessment Modal */}
      <Modal
        open={newAssessmentOpen}
        onClose={() => setNewAssessmentOpen(false)}
        title="Create Assessment"
        subtitle="Define an exam, quiz, assignment, or project under a subject."
      >
        <form onSubmit={handleCreateAssessment} className="space-y-4">
          <div>
            <label htmlFor="ass-subj" className="block text-sm font-medium text-slate-700">
              Subject
            </label>
            <select
              id="ass-subj"
              value={assSubjectId}
              onChange={(e) => setAssSubjectId(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {subjects.map((sub) => (
                <option key={sub.SubjectID} value={sub.SubjectID}>
                  {sub.SubjectName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ass-title" className="block text-sm font-medium text-slate-700">
              Assessment Title
            </label>
            <input
              id="ass-title"
              type="text"
              required
              value={assTitle}
              onChange={(e) => setAssTitle(e.target.value)}
              placeholder="e.g., Midterm Practical Exam"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ass-type" className="block text-sm font-medium text-slate-700">
                Type
              </label>
              <select
                id="ass-type"
                value={assType}
                onChange={(e) => setAssType(e.target.value as AssessmentType)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="Quiz">Quiz</option>
                <option value="Exam">Exam</option>
                <option value="Assignment">Assignment</option>
                <option value="Project">Project</option>
              </select>
            </div>
            <div>
              <label htmlFor="ass-max" className="block text-sm font-medium text-slate-700">
                Max Score
              </label>
              <input
                id="ass-max"
                type="number"
                min="1"
                step="0.01"
                required
                value={assMaxScore}
                onChange={(e) => setAssMaxScore(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="ass-reason" className="block text-sm font-medium text-slate-700">
              Audit Note <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="ass-reason"
              type="text"
              value={assReason}
              onChange={(e) => setAssReason(e.target.value)}
              placeholder="e.g., Scheduled week 6 evaluation"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setNewAssessmentOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Create Assessment
            </button>
          </div>
        </form>
      </Modal>

      {/* Quick Score Modal (from Assessment Panel) */}
      <Modal
        open={Boolean(quickStudent)}
        onClose={() => setQuickStudent(null)}
        title={quickStudent ? `Score · ${quickStudent.Name}` : 'Record Score'}
        subtitle={
          selectedAssessment
            ? `${selectedAssessment.Title} (Max ${selectedAssessment.MaxScore})`
            : undefined
        }
        maxWidth="sm"
      >
        {quickStudent && selectedAssessment && (
          <form onSubmit={handleSaveQuickScore} className="space-y-4">
            <div>
              <label htmlFor="q-score" className="block text-sm font-medium text-slate-700">
                Score (0 – {selectedAssessment.MaxScore})
              </label>
              <input
                id="q-score"
                type="number"
                step="0.01"
                min="0"
                required
                value={quickScoreVal}
                onChange={(e) => setQuickScoreVal(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="q-rem" className="block text-sm font-medium text-slate-700">
                Remarks <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                id="q-rem"
                type="text"
                value={quickRemarks}
                onChange={(e) => setQuickRemarks(e.target.value)}
                placeholder="e.g., Excellent work"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            {assessmentScores.some((sc) => sc.StudentID === quickStudent.StudentID) && (
              <div>
                <label htmlFor="q-reason" className="block text-sm font-medium text-slate-700">
                  Reason for Modifying Score <span className="text-red-600">*</span>
                </label>
                <input
                  id="q-reason"
                  type="text"
                  required={user.role === 'teacher'}
                  value={quickReason}
                  onChange={(e) => setQuickReason(e.target.value)}
                  placeholder="e.g., Corrected rubric grading error"
                  className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            )}

            {quickError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {quickError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuickStudent(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
              >
                Save Score
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Mandatory Reason Delete Score Modal */}
      <ReasonConfirmModal
        open={Boolean(deletingScore)}
        onClose={() => setDeletingScore(null)}
        title={
          deletingScore
            ? `Delete Score · ${deletingScore.StudentName} (${deletingScore.AssessmentTitle})`
            : 'Delete Score'
        }
        description="Deleting a student score requires a documented reason and records a flagged entry in the administrative audit log."
        confirmLabel="Confirm Score Deletion"
        onConfirm={async (deleteReason) => {
          if (!deletingScore) return;
          await apiRequest(`/api/scores/${deletingScore.ScoreID}`, {
            method: 'DELETE',
            body: JSON.stringify({ reason: deleteReason }),
          });
          await loadScores();
          onDataChanged();
        }}
      />
    </div>
  );
}
