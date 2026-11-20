import React, { useCallback, useEffect, useState } from 'react';
import { ArrowUpDown, BookOpen, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { AuthUser, Course, Section, SectionSubject, Subject, TeacherProfile } from '../types.ts';
import { Modal, ReasonConfirmModal } from './Modal.tsx';

interface SectionsViewProps {
  user: AuthUser;
  onOpenStudents: (sectionId: number) => void;
  onDataChanged: () => void;
}

export function SectionsView({ user, onOpenStudents, onDataChanged }: SectionsViewProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');
  const [sortBy, setSortBy] = useState('SectionName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Create/Edit Modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [sectionName, setSectionName] = useState('');
  const [courseId, setCourseId] = useState<number>(1);
  const [initialSubjectId, setInitialSubjectId] = useState<string>('');
  const [teacherId, setTeacherId] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete Modal
  const [deletingSection, setDeletingSection] = useState<Section | null>(null);

  // Section Subjects Drawer/Modal
  const [subjectsSection, setSubjectsSection] = useState<Section | null>(null);
  const [sectionSubjects, setSectionSubjects] = useState<SectionSubject[]>([]);
  const [newSubjectId, setNewSubjectId] = useState<number>(1);
  const [newSubjectTeacherId, setNewSubjectTeacherId] = useState<number>(1);
  const [addingSubject, setAddingSubject] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sortBy,
        sortDir,
        courseId: courseFilter,
      });
      if (search.trim()) params.set('search', search.trim());

      const requests: [Promise<Section[]>, Promise<Course[]>, Promise<Subject[]>] = [
        apiRequest<Section[]>(`/api/sections?${params.toString()}`),
        apiRequest<Course[]>('/api/courses'),
        apiRequest<Subject[]>('/api/subjects'),
      ];
      const [secRows, courseRows, subjRows] = await Promise.all(requests);
      setSections(secRows);
      setCourses(courseRows);
      setSubjects(subjRows);
      if (user.role === 'admin') {
        const tRows = await apiRequest<TeacherProfile[]>('/api/teachers');
        setTeachers(tRows);
        if (tRows.length > 0) {
          setNewSubjectTeacherId(tRows[0].TeacherID);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sections.');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir, courseFilter, search, user.role]);

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
    setEditingSection(null);
    setSectionName('');
    setCourseId(courses[0]?.CourseID || 1);
    setInitialSubjectId('');
    setTeacherId(teachers[0]?.TeacherID || user.id);
    setReason('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (sec: Section) => {
    setEditingSection(sec);
    setSectionName(sec.SectionName);
    setCourseId(sec.CourseID);
    setReason('');
    setFormError(null);
    setFormOpen(true);
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editingSection) {
        await apiRequest(`/api/sections/${editingSection.SectionID}`, {
          method: 'PUT',
          body: JSON.stringify({
            sectionName,
            courseId,
            reason: reason.trim() || undefined,
          }),
        });
      } else {
        await apiRequest('/api/sections', {
          method: 'POST',
          body: JSON.stringify({
            sectionName,
            courseId,
            subjectId: initialSubjectId ? Number(initialSubjectId) : undefined,
            teacherId,
            reason: reason.trim() || undefined,
          }),
        });
      }
      setFormOpen(false);
      await loadData();
      onDataChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save section.');
    } finally {
      setSaving(false);
    }
  };

  const openSubjectsModal = async (sec: Section) => {
    setSubjectsSection(sec);
    try {
      const rows = await apiRequest<SectionSubject[]>(`/api/section-subjects?sectionId=${sec.SectionID}`);
      setSectionSubjects(rows);
      if (subjects.length > 0) setNewSubjectId(subjects[0].SubjectID);
    } catch {
      setSectionSubjects([]);
    }
  };

  const handleAddSectionSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectsSection) return;
    setAddingSubject(true);
    setError(null);
    try {
      await apiRequest('/api/section-subjects', {
        method: 'POST',
        body: JSON.stringify({
          sectionId: subjectsSection.SectionID,
          subjectId: newSubjectId,
          teacherId: user.role === 'admin' ? newSubjectTeacherId : undefined,
        }),
      });
      const rows = await apiRequest<SectionSubject[]>(
        `/api/section-subjects?sectionId=${subjectsSection.SectionID}`
      );
      setSectionSubjects(rows);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to assign subject.');
    } finally {
      setAddingSubject(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search section or course..."
              className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>

          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            aria-label="Filter by course"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="all">All Courses</option>
            {courses.map((c) => (
              <option key={c.CourseID} value={c.CourseID}>
                {c.CourseName}
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
            aria-label="Sort sections"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          >
            <option value="SectionName:asc">Sort: Section (A–Z)</option>
            <option value="SectionName:desc">Sort: Section (Z–A)</option>
            <option value="CourseName:asc">Sort: Course (A–Z)</option>
            <option value="student_count:desc">Sort: Most Students</option>
            <option value="student_count:asc">Sort: Fewest Students</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Add Section</span>
        </button>
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
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : sections.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">No sections match your view</p>
            <p className="mt-1 text-xs text-slate-500">
              Create a new section tied to a degree course to start enrolling students.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-xs font-medium text-white hover:bg-blue-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add First Section</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('SectionName')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>Section</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('CourseName')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>Course</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3">Handled By</th>
                  <th className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('student_count')}
                      className="inline-flex items-center gap-1 hover:text-slate-800"
                    >
                      <span>Students</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Subjects</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sections.map((sec) => (
                  <tr key={sec.SectionID} className="transition-colors hover:bg-slate-50">
                    <td className="px-5 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      {sec.SectionName}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {sec.CourseName}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {sec.teacher_names || 'Unassigned'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                      {sec.student_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {sec.subject_count ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenStudents(sec.SectionID)}
                          title="View section students"
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 whitespace-nowrap"
                        >
                          <Users className="h-3.5 w-3.5" />
                          <span>Students</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openSubjectsModal(sec)}
                          title="Manage section subjects"
                          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                        >
                          <BookOpen className="h-3.5 w-3.5" />
                          <span>Subjects</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(sec)}
                          aria-label={`Edit ${sec.SectionName}`}
                          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingSection(sec)}
                          aria-label={`Delete ${sec.SectionName}`}
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

      {/* Add / Edit Section Modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingSection ? `Edit Section ${editingSection.SectionName}` : 'Add New Section'}
        subtitle="Sections belong to one course and link to teachers through SectionSubject assignments."
      >
        <form onSubmit={handleSaveSection} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sec-name" className="block text-sm font-medium text-slate-700">
                Section Code / Name
              </label>
              <input
                id="sec-name"
                type="text"
                required
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                placeholder="e.g., IT2R3"
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>

            <div>
              <label htmlFor="sec-course" className="block text-sm font-medium text-slate-700">
                Course Program
              </label>
              <select
                id="sec-course"
                value={courseId}
                onChange={(e) => setCourseId(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                {courses.map((c) => (
                  <option key={c.CourseID} value={c.CourseID}>
                    {c.CourseName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!editingSection && subjects.length > 0 && (
            <div>
              <label htmlFor="sec-subj" className="block text-sm font-medium text-slate-700">
                Initial Subject Assignment <span className="text-slate-400 font-normal">(optional, defaults to course subjects)</span>
              </label>
              <select
                id="sec-subj"
                value={initialSubjectId}
                onChange={(e) => setInitialSubjectId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="">Auto-assign Course Curriculum Subjects</option>
                {subjects.map((sub) => (
                  <option key={sub.SubjectID} value={sub.SubjectID}>
                    {sub.SubjectName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {user.role === 'admin' && !editingSection && teachers.length > 0 && (
            <div>
              <label htmlFor="sec-teacher" className="block text-sm font-medium text-slate-700">
                Assigned Teacher
              </label>
              <select
                id="sec-teacher"
                value={teacherId}
                onChange={(e) => setTeacherId(Number(e.target.value))}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                {teachers.map((t) => (
                  <option key={t.TeacherID} value={t.TeacherID}>
                    {t.Name} ({t.Email})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="sec-reason" className="block text-sm font-medium text-slate-700">
              Audit Note / Reason <span className="text-slate-400 font-normal">(logged for admin review)</span>
            </label>
            <input
              id="sec-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={editingSection ? 'e.g., Adjusted section program mapping' : 'e.g., New section opened for cohort'}
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
              {saving ? 'Saving...' : editingSection ? 'Save Changes' : 'Create Section'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Section Subjects Modal */}
      <Modal
        open={Boolean(subjectsSection)}
        onClose={() => setSubjectsSection(null)}
        title={subjectsSection ? `Subjects · ${subjectsSection.SectionName}` : 'Section Subjects'}
        subtitle="View and assign subjects handled in this section."
        maxWidth="lg"
      >
        <div className="space-y-5">
          {sectionSubjects.length === 0 ? (
            <p className="text-sm text-slate-500">No subjects assigned to this section yet.</p>
          ) : (
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {sectionSubjects.map((ss) => (
                <div key={ss.SectionSubjectID} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <div className="font-medium text-slate-900">
                      {ss.SubjectName}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      Handled by {ss.TeacherName || 'Assigned Faculty'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddSectionSubject} className="border-t border-slate-200 pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Assign Subject to Section</h3>
            <div className={`grid grid-cols-1 ${user.role === 'admin' && teachers.length > 0 ? 'sm:grid-cols-2' : ''} gap-3`}>
              <select
                value={newSubjectId}
                onChange={(e) => setNewSubjectId(Number(e.target.value))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                {subjects.map((sub) => (
                  <option key={sub.SubjectID} value={sub.SubjectID}>
                    {sub.SubjectName}
                  </option>
                ))}
              </select>
              {user.role === 'admin' && teachers.length > 0 && (
                <select
                  value={newSubjectTeacherId}
                  onChange={(e) => setNewSubjectTeacherId(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {teachers.map((t) => (
                    <option key={t.TeacherID} value={t.TeacherID}>
                      {t.Name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={addingSubject}
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {addingSubject ? 'Assigning...' : 'Assign Subject'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Mandatory Reason Delete Modal */}
      <ReasonConfirmModal
        open={Boolean(deletingSection)}
        onClose={() => setDeletingSection(null)}
        title={`Delete Section ${deletingSection?.SectionName ?? ''}`}
        description="Deleting a section permanently removes it once no active students remain and records a flagged deletion entry in the audit log."
        confirmLabel="Submit Section Deletion"
        onConfirm={async (deleteReason) => {
          if (!deletingSection) return;
          await apiRequest(`/api/sections/${deletingSection.SectionID}`, {
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
