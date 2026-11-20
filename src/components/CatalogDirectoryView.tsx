import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiRequest } from '../lib/api.ts';
import type { Course, CourseSubject, Subject, TeacherProfile } from '../types.ts';
import { Modal } from './Modal.tsx';

export function CatalogDirectoryView() {
  const [subTab, setSubTab] = useState<'courses' | 'subjects' | 'curriculum' | 'teachers'>('courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courseSubjects, setCourseSubjects] = useState<CourseSubject[]>([]);
  const [teachers, setTeachers] = useState<TeacherProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add Course Modal
  const [courseModalOpen, setCourseModalOpen] = useState(false);
  const [courseName, setCourseName] = useState('');

  // Add Subject Modal
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [subjectName, setSubjectName] = useState('');

  // Map Course-Subject Modal
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [mapCourseId, setMapCourseId] = useState<number>(1);
  const [mapSubjectId, setMapSubjectId] = useState<number>(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, s, cs, t] = await Promise.all([
        apiRequest<Course[]>('/api/courses'),
        apiRequest<Subject[]>('/api/subjects'),
        apiRequest<CourseSubject[]>('/api/course-subjects'),
        apiRequest<TeacherProfile[]>('/api/teachers'),
      ]);
      setCourses(c);
      setSubjects(s);
      setCourseSubjects(cs);
      setTeachers(t);
      if (c.length > 0) setMapCourseId(c[0].CourseID);
      if (s.length > 0) setMapSubjectId(s[0].SubjectID);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/courses', {
        method: 'POST',
        body: JSON.stringify({ courseName }),
      });
      setCourseModalOpen(false);
      setCourseName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add course.');
    }
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/subjects', {
        method: 'POST',
        body: JSON.stringify({ subjectName }),
      });
      setSubjectModalOpen(false);
      setSubjectName('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add subject.');
    }
  };

  const handleMapSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/course-subjects', {
        method: 'POST',
        body: JSON.stringify({
          courseId: mapCourseId,
          subjectId: mapSubjectId,
        }),
      });
      setMapModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to map subject.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
          {[
            { id: 'courses', label: `Courses (${courses.length})` },
            { id: 'subjects', label: `Subjects (${subjects.length})` },
            { id: 'curriculum', label: `Curriculum (${courseSubjects.length})` },
            { id: 'teachers', label: `Faculty (${teachers.length})` },
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

        {subTab === 'courses' && (
          <button
            type="button"
            onClick={() => setCourseModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Course</span>
          </button>
        )}
        {subTab === 'subjects' && (
          <button
            type="button"
            onClick={() => setSubjectModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Add Subject</span>
          </button>
        )}
        {subTab === 'curriculum' && (
          <button
            type="button"
            onClick={() => setMapModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>Map Subject to Course</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-11 rounded bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : subTab === 'courses' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Course ID</th>
                  <th className="px-4 py-3">Course Program Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courses.map((c) => (
                  <tr key={c.CourseID} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-blue-800 whitespace-nowrap tabular-nums">
                      #{c.CourseID}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{c.CourseName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : subTab === 'subjects' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Subject ID</th>
                  <th className="px-4 py-3">Subject Name</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subjects.map((s) => (
                  <tr key={s.SubjectID} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700 whitespace-nowrap tabular-nums">
                      #{s.SubjectID}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.SubjectName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : subTab === 'curriculum' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Course</th>
                  <th className="px-4 py-3">Mapped Subject</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {courseSubjects.map((cs) => (
                  <tr key={`${cs.CourseID}-${cs.SubjectID}`} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-blue-800">
                      {cs.CourseName}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {cs.SubjectName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                  <th className="px-5 py-3">Teacher ID</th>
                  <th className="px-4 py-3">Faculty Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-right">Sections</th>
                  <th className="px-5 py-3 text-right">Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {teachers.map((t) => (
                  <tr key={t.TeacherID} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-600 tabular-nums">
                      #{t.TeacherID}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{t.Name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{t.Email}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                      {t.section_count ?? 0}
                    </td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums text-slate-800">
                      {t.student_count ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Course Modal */}
      <Modal
        open={courseModalOpen}
        onClose={() => setCourseModalOpen(false)}
        title="Add Academic Course"
        maxWidth="sm"
      >
        <form onSubmit={handleAddCourse} className="space-y-4">
          <div>
            <label htmlFor="c-name" className="block text-sm font-medium text-slate-700">
              Course Name
            </label>
            <input
              id="c-name"
              type="text"
              required
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g., BS in Data Science (BSDS)"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCourseModalOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Save Course
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Subject Modal */}
      <Modal
        open={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
        title="Add Instructional Subject"
        maxWidth="sm"
      >
        <form onSubmit={handleAddSubject} className="space-y-4">
          <div>
            <label htmlFor="s-name" className="block text-sm font-medium text-slate-700">
              Subject Name
            </label>
            <input
              id="s-name"
              type="text"
              required
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g., Algorithms & Complexity"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSubjectModalOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Save Subject
            </button>
          </div>
        </form>
      </Modal>

      {/* Map Subject to Course Modal */}
      <Modal
        open={mapModalOpen}
        onClose={() => setMapModalOpen(false)}
        title="Map Subject to Course Curriculum"
        maxWidth="sm"
      >
        <form onSubmit={handleMapSubject} className="space-y-4">
          <div>
            <label htmlFor="m-course" className="block text-sm font-medium text-slate-700">
              Course
            </label>
            <select
              id="m-course"
              value={mapCourseId}
              onChange={(e) => setMapCourseId(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {courses.map((c) => (
                <option key={c.CourseID} value={c.CourseID}>
                  {c.CourseName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="m-subj" className="block text-sm font-medium text-slate-700">
              Subject
            </label>
            <select
              id="m-subj"
              value={mapSubjectId}
              onChange={(e) => setMapSubjectId(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              {subjects.map((s) => (
                <option key={s.SubjectID} value={s.SubjectID}>
                  {s.SubjectName}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setMapModalOpen(false)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              Save Mapping
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
