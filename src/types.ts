export type UserRole = 'teacher' | 'admin';

export interface AuthUser {
  id: number;
  role: UserRole;
  name: string;
  email: string;
}

export interface Course {
  CourseID: number;
  CourseName: string;
}

export interface Subject {
  SubjectID: number;
  SubjectName: string;
}

export interface CourseSubject {
  CourseID: number;
  SubjectID: number;
  CourseName?: string;
  SubjectName?: string;
}

export interface TeacherProfile {
  TeacherID: number;
  Name: string;
  Email: string;
  section_count?: number;
  student_count?: number;
}

export interface Section {
  SectionID: number;
  CourseID: number;
  SectionName: string;
  CourseName?: string;
  teacher_names?: string;
  student_count?: number;
  subject_count?: number;
}

export interface SectionSubject {
  SectionSubjectID: number;
  SectionID: number;
  SubjectID: number;
  TeacherID: number;
  SectionName?: string;
  SubjectName?: string;
  TeacherName?: string;
  CourseName?: string;
}

export interface Student {
  StudentID: number;
  SectionID: number;
  Name: string;
  Email: string | null;
  Status: string;
  SectionName?: string;
  CourseName?: string;
  score_count?: number;
  avg_percentage?: number | null;
  absences_count?: number;
}

export type AssessmentType = 'Exam' | 'Quiz' | 'Assignment' | 'Project';

export interface Assessment {
  AssessmentID: number;
  SubjectID: number;
  Title: string;
  MaxScore: number;
  AssessmentType: string;
  SubjectName?: string;
  graded_count?: number;
}

export interface StudentScore {
  ScoreID: number;
  AssessmentID: number;
  StudentID: number;
  Score: number;
  Remarks: string | null;
  StudentName?: string;
  SectionID?: number;
  SectionName?: string;
  SubjectID?: number;
  SubjectName?: string;
  AssessmentTitle?: string;
  AssessmentType?: string;
  MaxScore?: number;
}

export type AttendanceStatus = 'Present' | 'Absent' | 'Late' | 'Excused';

export interface AttendanceRecord {
  AttendanceID: number | null;
  StudentID: number;
  SubjectID: number;
  Date: string;
  Status: AttendanceStatus;
  StudentName?: string;
  SectionName?: string;
  SubjectName?: string;
}

export type LogActionType = 'ADD' | 'EDIT' | 'DELETE' | 'LOGIN' | 'REGISTER' | 'CLEANUP';
export type LogStatus = 'Pending' | 'Approved' | 'Rejected' | 'Logged';

export interface AuditLog {
  LogID: number;
  TeacherID: number | null;
  AdminID: number | null;
  Reason: string;
  ActionType: LogActionType;
  AffectedTable: string;
  AffectedRecordID: number;
  Timestamp: string;
  Status: LogStatus;
  TeacherName?: string | null;
  AdminName?: string | null;
}

export interface DashboardSummary {
  role: UserRole;
  metrics: {
    sections: number;
    students: number;
    scores: number;
    pendingReviews: number;
    courses: number;
    subjects: number;
    teachers: number;
    totalLogs: number;
    logThreshold: number;
  };
  recentLogs: AuditLog[];
  sectionSummaries: Array<{
    SectionID: number;
    SectionName: string;
    CourseName: string;
    student_count: number;
    avg_grade_pct: number | null;
    absences_count: number;
  }>;
}

export interface MaintenanceStatus {
  totalLogs: number;
  pendingCount: number;
  resolvedCount: number;
  systemEventCount: number;
  maxThreshold: number;
  needsMaintenance: boolean;
}
