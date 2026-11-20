import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  type AuthenticatedRequest,
  createToken,
  hashPassword,
  requireAdmin,
  requireAuth,
  verifyPassword,
} from './auth.ts';
import { db, getDbDriver, nowSqlTimestamp } from './db.ts';

export const apiRouter = Router();

let logMaxThreshold = 50;

function asyncRoute(
  fn: (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
}

async function recordLog(params: {
  teacherId?: number | null;
  adminId?: number | null;
  reason: string;
  actionType: 'ADD' | 'EDIT' | 'DELETE' | 'LOGIN' | 'REGISTER' | 'CLEANUP';
  affectedTable: string;
  affectedRecordId: number;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Logged';
}): Promise<number> {
  const result = await db.execute(
    `INSERT INTO Log (
      TeacherID, AdminID, Reason, ActionType, AffectedTable, AffectedRecordID, Timestamp, Status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.teacherId ?? null,
      params.adminId ?? null,
      params.reason.trim().slice(0, 255),
      params.actionType.slice(0, 10),
      params.affectedTable.slice(0, 20),
      params.affectedRecordId,
      nowSqlTimestamp(),
      params.status.slice(0, 10),
    ]
  );
  return result.insertId;
}

async function verifySectionAccess(
  sectionId: number,
  user: NonNullable<AuthenticatedRequest['authUser']>,
  res: Response
): Promise<{ SectionID: number; CourseID: number; SectionName: string } | null> {
  const sec = await db.queryOne<{ SectionID: number; CourseID: number; SectionName: string }>(
    'SELECT SectionID, CourseID, SectionName FROM Section WHERE SectionID = ?',
    [sectionId]
  );
  if (!sec) {
    res.status(404).json({ error: 'Section not found.' });
    return null;
  }
  if (user.role === 'teacher') {
    const link = await db.queryOne<{ SectionSubjectID: number }>(
      'SELECT SectionSubjectID FROM SectionSubject WHERE SectionID = ? AND TeacherID = ? LIMIT 1',
      [sectionId, user.id]
    );
    if (!link) {
      res.status(403).json({ error: 'Access denied: you do not handle this section.' });
      return null;
    }
  }
  return sec;
}

// Health check
apiRouter.get(
  '/health',
  asyncRoute(async (_req, res) => {
    await db.queryOne('SELECT 1 as ok');
    res.json({ ok: true, database: getDbDriver() });
  })
);

// ==================== AUTH ====================

apiRouter.post(
  '/auth/register',
  asyncRoute(async (req, res) => {
    const { name, email, password } = req.body as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name?.trim() || !email?.trim() || !password) {
      res.status(400).json({ error: 'Name, email, and password are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existingTeacher = await db.queryOne(
      'SELECT TeacherID FROM Teacher WHERE lower(Email) = ?',
      [normalizedEmail]
    );
    const existingAdmin = await db.queryOne(
      'SELECT AdminID FROM Admin WHERE lower(Email) = ?',
      [normalizedEmail]
    );
    if (existingTeacher || existingAdmin) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const pwHash = hashPassword(password);
    const info = await db.execute(
      'INSERT INTO Teacher (Name, Email, Password) VALUES (?, ?, ?)',
      [name.trim(), normalizedEmail, pwHash]
    );

    const teacherId = info.insertId;
    const authUser = {
      id: teacherId,
      role: 'teacher' as const,
      name: name.trim(),
      email: normalizedEmail,
    };

    await recordLog({
      teacherId,
      reason: 'Teacher account registered',
      actionType: 'REGISTER',
      affectedTable: 'Teacher',
      affectedRecordId: teacherId,
      status: 'Logged',
    });

    res.status(201).json({ token: createToken(authUser), user: authUser });
  })
);

apiRouter.post(
  '/auth/login',
  asyncRoute(async (req, res) => {
    const { email, password, role } = req.body as {
      email?: string;
      password?: string;
      role?: 'teacher' | 'admin';
    };

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const identifier = email.trim().toLowerCase();

    if (!role || role === 'teacher') {
      const teacher = await db.queryOne<{
        TeacherID: number;
        Name: string;
        Email: string;
        Password: string;
      }>('SELECT * FROM Teacher WHERE lower(Email) = ?', [identifier]);

      if (teacher && verifyPassword(password, teacher.Password)) {
        const authUser = {
          id: teacher.TeacherID,
          role: 'teacher' as const,
          name: teacher.Name,
          email: teacher.Email,
        };
        await recordLog({
          teacherId: teacher.TeacherID,
          reason: 'Teacher signed in',
          actionType: 'LOGIN',
          affectedTable: 'Teacher',
          affectedRecordId: teacher.TeacherID,
          status: 'Logged',
        });
        res.json({ token: createToken(authUser), user: authUser });
        return;
      }
      if (role === 'teacher') {
        res.status(401).json({ error: 'Invalid teacher email or password.' });
        return;
      }
    }

    if (!role || role === 'admin') {
      const admin = await db.queryOne<{
        AdminID: number;
        Name: string;
        Email: string;
        Password: string;
      }>('SELECT * FROM Admin WHERE lower(Email) = ?', [identifier]);

      if (admin && verifyPassword(password, admin.Password)) {
        const authUser = {
          id: admin.AdminID,
          role: 'admin' as const,
          name: admin.Name,
          email: admin.Email,
        };
        await recordLog({
          adminId: admin.AdminID,
          reason: 'Administrator signed in',
          actionType: 'LOGIN',
          affectedTable: 'Admin',
          affectedRecordId: admin.AdminID,
          status: 'Logged',
        });
        res.json({ token: createToken(authUser), user: authUser });
        return;
      }
    }

    res.status(401).json({ error: 'Invalid credentials. Please check your email and password.' });
  })
);

apiRouter.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.authUser });
});

// ==================== DASHBOARD ====================

apiRouter.get(
  '/dashboard',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const isTeacher = user.role === 'teacher';

    const sectionsCount = isTeacher
      ? (
          await db.queryOne<{ c: number }>(
            'SELECT COUNT(DISTINCT SectionID) as c FROM SectionSubject WHERE TeacherID = ?',
            [user.id]
          )
        )?.c ?? 0
      : (await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM Section'))?.c ?? 0;

    const studentsCount = isTeacher
      ? (
          await db.queryOne<{ c: number }>(
            `SELECT COUNT(DISTINCT st.StudentID) as c
             FROM Student st
             JOIN SectionSubject ss ON ss.SectionID = st.SectionID
             WHERE ss.TeacherID = ? AND st.Status = 'Active'`,
            [user.id]
          )
        )?.c ?? 0
      : (
          await db.queryOne<{ c: number }>(
            "SELECT COUNT(*) as c FROM Student WHERE Status = 'Active'"
          )
        )?.c ?? 0;

    const scoresCount = isTeacher
      ? (
          await db.queryOne<{ c: number }>(
            `SELECT COUNT(DISTINCT sc.ScoreID) as c
             FROM StudentScore sc
             JOIN Student st ON st.StudentID = sc.StudentID
             JOIN Assessment a ON a.AssessmentID = sc.AssessmentID
             JOIN SectionSubject ss ON ss.SectionID = st.SectionID AND ss.SubjectID = a.SubjectID
             WHERE ss.TeacherID = ? AND st.Status = 'Active'`,
            [user.id]
          )
        )?.c ?? 0
      : (await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM StudentScore'))?.c ?? 0;

    const pendingReviews = isTeacher
      ? (
          await db.queryOne<{ c: number }>(
            "SELECT COUNT(*) as c FROM Log WHERE TeacherID = ? AND Status = 'Pending'",
            [user.id]
          )
        )?.c ?? 0
      : (await db.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM Log WHERE Status = 'Pending'"))
          ?.c ?? 0;

    const coursesCount = (await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM Course'))?.c ?? 0;
    const subjectsCount = (await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM Subject'))?.c ?? 0;
    const teachersCount = (await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM Teacher'))?.c ?? 0;
    const totalLogs = (await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM Log'))?.c ?? 0;

    const recentLogs = isTeacher
      ? await db.query(
          `SELECT l.*, t.Name AS TeacherName, a.Name AS AdminName
           FROM Log l
           LEFT JOIN Teacher t ON t.TeacherID = l.TeacherID
           LEFT JOIN Admin a ON a.AdminID = l.AdminID
           WHERE l.TeacherID = ? AND l.ActionType IN ('ADD', 'EDIT', 'DELETE')
           ORDER BY l.Timestamp DESC, l.LogID DESC
           LIMIT 6`,
          [user.id]
        )
      : await db.query(
          `SELECT l.*, t.Name AS TeacherName, a.Name AS AdminName
           FROM Log l
           LEFT JOIN Teacher t ON t.TeacherID = l.TeacherID
           LEFT JOIN Admin a ON a.AdminID = l.AdminID
           WHERE l.ActionType IN ('ADD', 'EDIT', 'DELETE')
           ORDER BY CASE WHEN l.Status = 'Pending' THEN 0 ELSE 1 END, l.Timestamp DESC, l.LogID DESC
           LIMIT 8`
        );

    const sectionSummaries = await db.query(
      `SELECT
        s.SectionID,
        s.SectionName,
        c.CourseName,
        COUNT(DISTINCT CASE WHEN st.Status = 'Active' THEN st.StudentID END) AS student_count,
        ROUND(AVG(CASE WHEN st.Status = 'Active' AND a.MaxScore > 0 THEN (sc.Score * 100.0 / a.MaxScore) END), 1) AS avg_grade_pct,
        COUNT(DISTINCT CASE WHEN st.Status = 'Active' AND att.Status = 'Absent' THEN att.AttendanceID END) AS absences_count
      FROM Section s
      JOIN Course c ON c.CourseID = s.CourseID
      LEFT JOIN Student st ON st.SectionID = s.SectionID
      LEFT JOIN StudentScore sc ON sc.StudentID = st.StudentID
      LEFT JOIN Assessment a ON a.AssessmentID = sc.AssessmentID
      LEFT JOIN Attendance att ON att.StudentID = st.StudentID
      ${
        isTeacher
          ? 'WHERE EXISTS (SELECT 1 FROM SectionSubject ss WHERE ss.SectionID = s.SectionID AND ss.TeacherID = ?)'
          : ''
      }
      GROUP BY s.SectionID, s.SectionName, c.CourseName
      ORDER BY s.SectionName ASC`,
      isTeacher ? [user.id] : []
    );

    res.json({
      role: user.role,
      metrics: {
        sections: sectionsCount,
        students: studentsCount,
        scores: scoresCount,
        pendingReviews,
        courses: coursesCount,
        subjects: subjectsCount,
        teachers: teachersCount,
        totalLogs,
        logThreshold: logMaxThreshold,
      },
      recentLogs,
      sectionSummaries,
    });
  })
);

// ==================== CATALOG (COURSES, SUBJECTS, TEACHERS) ====================

apiRouter.get(
  '/courses',
  requireAuth,
  asyncRoute(async (_req, res) => {
    res.json(await db.query('SELECT * FROM Course ORDER BY CourseName ASC'));
  })
);

apiRouter.post(
  '/courses',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { courseName } = req.body as { courseName?: string };
    if (!courseName?.trim()) {
      res.status(400).json({ error: 'Course name is required.' });
      return;
    }
    try {
      const info = await db.execute('INSERT INTO Course (CourseName) VALUES (?)', [
        courseName.trim(),
      ]);
      await recordLog({
        adminId: req.authUser!.id,
        reason: `Added course ${courseName.trim()}`,
        actionType: 'ADD',
        affectedTable: 'Course',
        affectedRecordId: info.insertId,
        status: 'Approved',
      });
      res.status(201).json(await db.queryOne('SELECT * FROM Course WHERE CourseID = ?', [info.insertId]));
    } catch {
      res.status(409).json({ error: 'Course already exists.' });
    }
  })
);

apiRouter.get(
  '/subjects',
  requireAuth,
  asyncRoute(async (_req, res) => {
    res.json(await db.query('SELECT * FROM Subject ORDER BY SubjectName ASC'));
  })
);

apiRouter.post(
  '/subjects',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { subjectName } = req.body as { subjectName?: string };
    if (!subjectName?.trim()) {
      res.status(400).json({ error: 'Subject name is required.' });
      return;
    }
    const info = await db.execute('INSERT INTO Subject (SubjectName) VALUES (?)', [
      subjectName.trim(),
    ]);
    await recordLog({
      adminId: req.authUser!.id,
      reason: `Added subject ${subjectName.trim()}`,
      actionType: 'ADD',
      affectedTable: 'Subject',
      affectedRecordId: info.insertId,
      status: 'Approved',
    });
    res.status(201).json(await db.queryOne('SELECT * FROM Subject WHERE SubjectID = ?', [info.insertId]));
  })
);

apiRouter.get(
  '/course-subjects',
  requireAuth,
  asyncRoute(async (_req, res) => {
    const rows = await db.query(
      `SELECT cs.CourseID, cs.SubjectID, c.CourseName, s.SubjectName
       FROM CourseSubject cs
       JOIN Course c ON c.CourseID = cs.CourseID
       JOIN Subject s ON s.SubjectID = cs.SubjectID
       ORDER BY c.CourseName ASC, s.SubjectName ASC`
    );
    res.json(rows);
  })
);

apiRouter.post(
  '/course-subjects',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const { courseId, subjectId } = req.body as { courseId?: number; subjectId?: number };
    if (!courseId || !subjectId) {
      res.status(400).json({ error: 'Course and subject are required.' });
      return;
    }
    try {
      await db.execute('INSERT INTO CourseSubject (CourseID, SubjectID) VALUES (?, ?)', [
        Number(courseId),
        Number(subjectId),
      ]);
      res.status(201).json({ ok: true });
    } catch {
      res.status(409).json({ error: 'This subject is already mapped to the selected course.' });
    }
  })
);

apiRouter.get(
  '/teachers',
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const rows = await db.query(
      `SELECT
        t.TeacherID,
        t.Name,
        t.Email,
        COUNT(DISTINCT ss.SectionID) AS section_count,
        COUNT(DISTINCT CASE WHEN st.Status = 'Active' THEN st.StudentID END) AS student_count
      FROM Teacher t
      LEFT JOIN SectionSubject ss ON ss.TeacherID = t.TeacherID
      LEFT JOIN Student st ON st.SectionID = ss.SectionID
      GROUP BY t.TeacherID, t.Name, t.Email
      ORDER BY t.Name ASC`
    );
    res.json(rows);
  })
);

// ==================== SECTIONS (LAYER 2) ====================

apiRouter.get(
  '/sections',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sortBy, sortDir, search, courseId } = req.query as Record<string, string | undefined>;

    const sortMap: Record<string, string> = {
      SectionName: 's.SectionName',
      CourseName: 'c.CourseName',
      student_count: 'student_count',
    };
    const orderCol = sortMap[sortBy || 'SectionName'] || 's.SectionName';
    const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

    const conditions: string[] = ['1=1'];
    const args: Array<string | number> = [];

    if (user.role === 'teacher') {
      conditions.push('EXISTS (SELECT 1 FROM SectionSubject ss2 WHERE ss2.SectionID = s.SectionID AND ss2.TeacherID = ?)');
      args.push(user.id);
    }
    if (courseId && courseId !== 'all') {
      conditions.push('s.CourseID = ?');
      args.push(Number(courseId));
    }
    if (search?.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push('(lower(s.SectionName) LIKE ? OR lower(c.CourseName) LIKE ?)');
      args.push(q, q);
    }

    const sql = `
      SELECT
        s.SectionID,
        s.CourseID,
        s.SectionName,
        c.CourseName,
        GROUP_CONCAT(DISTINCT t.Name) AS teacher_names,
        COUNT(DISTINCT CASE WHEN st.Status = 'Active' THEN st.StudentID END) AS student_count,
        COUNT(DISTINCT ss.SectionSubjectID) AS subject_count
      FROM Section s
      JOIN Course c ON c.CourseID = s.CourseID
      LEFT JOIN SectionSubject ss ON ss.SectionID = s.SectionID
      LEFT JOIN Teacher t ON t.TeacherID = ss.TeacherID
      LEFT JOIN Student st ON st.SectionID = s.SectionID
      WHERE ${conditions.join(' AND ')}
      GROUP BY s.SectionID, s.CourseID, s.SectionName, c.CourseName
      ORDER BY ${orderCol} ${dir}, s.SectionID ASC
    `;
    res.json(await db.query(sql, args));
  })
);

apiRouter.post(
  '/sections',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sectionName, courseId, subjectId, teacherId, reason } = req.body as {
      sectionName?: string;
      courseId?: number;
      subjectId?: number;
      teacherId?: number;
      reason?: string;
    };

    if (!sectionName?.trim() || !courseId) {
      res.status(400).json({ error: 'Section name and course are required.' });
      return;
    }

    const assignedTeacherId = user.role === 'teacher' ? user.id : Number(teacherId || 1);
    const info = await db.execute('INSERT INTO Section (CourseID, SectionName) VALUES (?, ?)', [
      Number(courseId),
      sectionName.trim().toUpperCase(),
    ]);
    const sectionId = info.insertId;

    // Link subjects so the teacher handles this section via SectionSubject
    if (subjectId) {
      await db.execute(
        'INSERT INTO SectionSubject (SectionID, SubjectID, TeacherID) VALUES (?, ?, ?)',
        [sectionId, Number(subjectId), assignedTeacherId]
      );
    } else {
      const mapped = await db.query<{ SubjectID: number }>(
        'SELECT SubjectID FROM CourseSubject WHERE CourseID = ?',
        [Number(courseId)]
      );
      if (mapped.length > 0) {
        for (const m of mapped) {
          await db.execute(
            'INSERT INTO SectionSubject (SectionID, SubjectID, TeacherID) VALUES (?, ?, ?)',
            [sectionId, m.SubjectID, assignedTeacherId]
          );
        }
      } else {
        const firstSub = await db.queryOne<{ SubjectID: number }>(
          'SELECT SubjectID FROM Subject ORDER BY SubjectID ASC LIMIT 1'
        );
        if (firstSub) {
          await db.execute(
            'INSERT INTO SectionSubject (SectionID, SubjectID, TeacherID) VALUES (?, ?, ?)',
            [sectionId, firstSub.SubjectID, assignedTeacherId]
          );
        }
      }
    }

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : assignedTeacherId,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason?.trim() || 'New section opened',
      actionType: 'ADD',
      affectedTable: 'Section',
      affectedRecordId: sectionId,
      status: user.role === 'admin' ? 'Approved' : 'Pending',
    });

    const created = await db.queryOne(
      `SELECT s.*, c.CourseName
       FROM Section s
       JOIN Course c ON c.CourseID = s.CourseID
       WHERE s.SectionID = ?`,
      [sectionId]
    );
    res.status(201).json(created);
  })
);

apiRouter.put(
  '/sections/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const sectionId = Number(req.params.id);
    const existing = await verifySectionAccess(sectionId, user, res);
    if (!existing) return;

    const { sectionName, courseId, reason } = req.body as {
      sectionName?: string;
      courseId?: number;
      reason?: string;
    };

    if (!sectionName?.trim() || !courseId) {
      res.status(400).json({ error: 'Section name and course are required.' });
      return;
    }

    await db.execute('UPDATE Section SET SectionName = ?, CourseID = ? WHERE SectionID = ?', [
      sectionName.trim().toUpperCase(),
      Number(courseId),
      sectionId,
    ]);

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason?.trim() || 'Updated section details',
      actionType: 'EDIT',
      affectedTable: 'Section',
      affectedRecordId: sectionId,
      status: user.role === 'admin' ? 'Approved' : reason?.trim() ? 'Pending' : 'Logged',
    });

    res.json(await db.queryOne('SELECT * FROM Section WHERE SectionID = ?', [sectionId]));
  })
);

apiRouter.delete(
  '/sections/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const sectionId = Number(req.params.id);
    const existing = await verifySectionAccess(sectionId, user, res);
    if (!existing) return;

    const reason = (req.body?.reason as string | undefined) || (req.query.reason as string | undefined);
    if (!reason || reason.trim().length < 3) {
      res.status(400).json({
        error: 'A valid reason (at least 3 characters) is required to delete a section.',
      });
      return;
    }

    const activeStu = await db.queryOne<{ c: number }>(
      "SELECT COUNT(*) as c FROM Student WHERE SectionID = ? AND Status = 'Active'",
      [sectionId]
    );
    if ((activeStu?.c ?? 0) > 0) {
      res.status(400).json({
        error:
          'This section still has active students. Transfer or archive its students before deleting the section.',
      });
      return;
    }

    const stuRows = await db.query<{ StudentID: number }>(
      'SELECT StudentID FROM Student WHERE SectionID = ?',
      [sectionId]
    );
    if (stuRows.length > 0) {
      const stuIds = stuRows.map((r) => r.StudentID);
      const ph = stuIds.map(() => '?').join(',');
      await db.execute(`DELETE FROM StudentScore WHERE StudentID IN (${ph})`, stuIds);
      await db.execute(`DELETE FROM Attendance WHERE StudentID IN (${ph})`, stuIds);
      await db.execute(`DELETE FROM Student WHERE SectionID = ?`, [sectionId]);
    }
    await db.execute('DELETE FROM SectionSubject WHERE SectionID = ?', [sectionId]);
    await db.execute('DELETE FROM Section WHERE SectionID = ?', [sectionId]);

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason.trim(),
      actionType: 'DELETE',
      affectedTable: 'Section',
      affectedRecordId: sectionId,
      status: user.role === 'admin' ? 'Approved' : 'Pending',
    });

    res.json({ ok: true });
  })
);

// Section Subjects
apiRouter.get(
  '/section-subjects',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sectionId } = req.query as { sectionId?: string };

    const conditions = ['1=1'];
    const args: Array<string | number> = [];

    if (user.role === 'teacher') {
      conditions.push('ss.TeacherID = ?');
      args.push(user.id);
    }
    if (sectionId && sectionId !== 'all') {
      conditions.push('ss.SectionID = ?');
      args.push(Number(sectionId));
    }

    const rows = await db.query(
      `SELECT
        ss.*,
        s.SectionName,
        c.CourseName,
        sub.SubjectName,
        t.Name AS TeacherName
      FROM SectionSubject ss
      JOIN Section s ON s.SectionID = ss.SectionID
      JOIN Course c ON c.CourseID = s.CourseID
      JOIN Subject sub ON sub.SubjectID = ss.SubjectID
      JOIN Teacher t ON t.TeacherID = ss.TeacherID
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.SectionName ASC, sub.SubjectName ASC`,
      args
    );
    res.json(rows);
  })
);

apiRouter.post(
  '/section-subjects',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sectionId, subjectId, teacherId } = req.body as {
      sectionId?: number;
      subjectId?: number;
      teacherId?: number;
    };
    if (!sectionId || !subjectId) {
      res.status(400).json({ error: 'Section and subject are required.' });
      return;
    }
    const sec = await verifySectionAccess(Number(sectionId), user, res);
    if (!sec) return;

    const assignedTeacher = user.role === 'teacher' ? user.id : Number(teacherId || user.id);
    const exists = await db.queryOne(
      'SELECT SectionSubjectID FROM SectionSubject WHERE SectionID = ? AND SubjectID = ? AND TeacherID = ?',
      [Number(sectionId), Number(subjectId), assignedTeacher]
    );
    if (exists) {
      res.status(409).json({ error: 'Subject is already assigned to this section for this teacher.' });
      return;
    }

    const info = await db.execute(
      'INSERT INTO SectionSubject (SectionID, SubjectID, TeacherID) VALUES (?, ?, ?)',
      [Number(sectionId), Number(subjectId), assignedTeacher]
    );
    res.status(201).json({ SectionSubjectID: info.insertId });
  })
);

// ==================== STUDENTS (LAYER 1) ====================

apiRouter.get(
  '/students',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sectionId, search, sortBy, sortDir, status } = req.query as Record<
      string,
      string | undefined
    >;

    const sortMap: Record<string, string> = {
      Name: 'st.Name',
      StudentID: 'st.StudentID',
      SectionName: 's.SectionName',
      avg_percentage: 'avg_percentage',
      absences_count: 'absences_count',
    };
    const orderCol = sortMap[sortBy || 'Name'] || 'st.Name';
    const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

    const conditions: string[] = [];
    const args: Array<string | number> = [];

    if (status && status !== 'all') {
      conditions.push('st.Status = ?');
      args.push(status);
    } else if (!status) {
      conditions.push("st.Status = 'Active'");
    }

    if (user.role === 'teacher') {
      conditions.push(
        'EXISTS (SELECT 1 FROM SectionSubject ss WHERE ss.SectionID = st.SectionID AND ss.TeacherID = ?)'
      );
      args.push(user.id);
    }
    if (sectionId && sectionId !== 'all') {
      conditions.push('st.SectionID = ?');
      args.push(Number(sectionId));
    }
    if (search?.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        "(lower(st.Name) LIKE ? OR lower(COALESCE(st.Email, '')) LIKE ? OR lower(s.SectionName) LIKE ?)"
      );
      args.push(q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT
        st.StudentID,
        st.SectionID,
        st.Name,
        st.Email,
        st.Status,
        s.SectionName,
        c.CourseName,
        COUNT(DISTINCT sc.ScoreID) AS score_count,
        ROUND(AVG(CASE WHEN a.MaxScore > 0 THEN (sc.Score * 100.0 / a.MaxScore) END), 1) AS avg_percentage,
        COUNT(DISTINCT CASE WHEN att.Status = 'Absent' THEN att.AttendanceID END) AS absences_count
      FROM Student st
      JOIN Section s ON s.SectionID = st.SectionID
      JOIN Course c ON c.CourseID = s.CourseID
      LEFT JOIN StudentScore sc ON sc.StudentID = st.StudentID
      LEFT JOIN Assessment a ON a.AssessmentID = sc.AssessmentID
      LEFT JOIN Attendance att ON att.StudentID = st.StudentID
      ${whereClause}
      GROUP BY st.StudentID, st.SectionID, st.Name, st.Email, st.Status, s.SectionName, c.CourseName
      ORDER BY ${orderCol} ${dir}, st.StudentID ASC
    `;
    res.json(await db.query(sql, args));
  })
);

apiRouter.post(
  '/students',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { name, email, sectionId, reason } = req.body as {
      name?: string;
      email?: string;
      sectionId?: number;
      reason?: string;
    };

    if (!name?.trim() || !sectionId) {
      res.status(400).json({ error: 'Student name and section are required.' });
      return;
    }

    const sec = await verifySectionAccess(Number(sectionId), user, res);
    if (!sec) return;

    const cleanEmail = email?.trim() ? email.trim().toLowerCase() : null;

    try {
      const info = await db.execute(
        "INSERT INTO Student (SectionID, Name, Email, Status) VALUES (?, ?, ?, 'Active')",
        [Number(sectionId), name.trim(), cleanEmail]
      );

      await recordLog({
        teacherId: user.role === 'teacher' ? user.id : null,
        adminId: user.role === 'admin' ? user.id : null,
        reason: reason?.trim() || 'New student enrolled in section',
        actionType: 'ADD',
        affectedTable: 'Student',
        affectedRecordId: info.insertId,
        status: user.role === 'admin' ? 'Approved' : 'Pending',
      });

      res.status(201).json(await db.queryOne('SELECT * FROM Student WHERE StudentID = ?', [info.insertId]));
    } catch {
      res.status(409).json({ error: 'A student with this email already exists.' });
    }
  })
);

apiRouter.put(
  '/students/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const studentId = Number(req.params.id);

    const existing = await db.queryOne<{ StudentID: number; SectionID: number }>(
      'SELECT StudentID, SectionID FROM Student WHERE StudentID = ?',
      [studentId]
    );
    if (!existing) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    if (!(await verifySectionAccess(existing.SectionID, user, res))) return;

    const { name, email, sectionId, status, reason } = req.body as {
      name?: string;
      email?: string;
      sectionId?: number;
      status?: string;
      reason?: string;
    };

    if (!name?.trim() || !sectionId) {
      res.status(400).json({ error: 'Student name and section are required.' });
      return;
    }
    if (!(await verifySectionAccess(Number(sectionId), user, res))) return;

    const cleanEmail = email?.trim() ? email.trim().toLowerCase() : null;
    try {
      await db.execute(
        'UPDATE Student SET Name = ?, Email = ?, SectionID = ?, Status = ? WHERE StudentID = ?',
        [name.trim(), cleanEmail, Number(sectionId), status?.trim() || 'Active', studentId]
      );
    } catch {
      res.status(409).json({ error: 'Student email conflicts with another record.' });
      return;
    }

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason?.trim() || 'Updated student details',
      actionType: 'EDIT',
      affectedTable: 'Student',
      affectedRecordId: studentId,
      status: user.role === 'admin' ? 'Approved' : reason?.trim() ? 'Pending' : 'Logged',
    });

    res.json(await db.queryOne('SELECT * FROM Student WHERE StudentID = ?', [studentId]));
  })
);

apiRouter.delete(
  '/students/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const studentId = Number(req.params.id);

    const existing = await db.queryOne<{ StudentID: number; SectionID: number }>(
      'SELECT StudentID, SectionID FROM Student WHERE StudentID = ?',
      [studentId]
    );
    if (!existing) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    if (!(await verifySectionAccess(existing.SectionID, user, res))) return;

    const reason = (req.body?.reason as string | undefined) || (req.query.reason as string | undefined);
    if (!reason || reason.trim().length < 3) {
      res.status(400).json({
        error: 'A valid reason (at least 3 characters) is required to delete a student.',
      });
      return;
    }

    await db.execute("UPDATE Student SET Status = 'Archived' WHERE StudentID = ?", [studentId]);

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason.trim(),
      actionType: 'DELETE',
      affectedTable: 'Student',
      affectedRecordId: studentId,
      status: user.role === 'admin' ? 'Approved' : 'Pending',
    });

    res.json({ ok: true, pendingReview: user.role === 'teacher' });
  })
);

// ==================== ASSESSMENTS, STUDENT SCORES & ATTENDANCE (LAYER 3) ====================

apiRouter.get(
  '/assessments',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { subjectId } = req.query as { subjectId?: string };

    const conditions = ['1=1'];
    const args: Array<string | number> = [];

    if (user.role === 'teacher') {
      conditions.push(
        'EXISTS (SELECT 1 FROM SectionSubject ss WHERE ss.SubjectID = a.SubjectID AND ss.TeacherID = ?)'
      );
      args.push(user.id);
    }
    if (subjectId && subjectId !== 'all') {
      conditions.push('a.SubjectID = ?');
      args.push(Number(subjectId));
    }

    const rows = await db.query(
      `SELECT
        a.AssessmentID,
        a.SubjectID,
        a.Title,
        a.MaxScore,
        a.AssessmentType,
        sub.SubjectName,
        COUNT(sc.ScoreID) AS graded_count
      FROM Assessment a
      JOIN Subject sub ON sub.SubjectID = a.SubjectID
      LEFT JOIN StudentScore sc ON sc.AssessmentID = a.AssessmentID
      WHERE ${conditions.join(' AND ')}
      GROUP BY a.AssessmentID, a.SubjectID, a.Title, a.MaxScore, a.AssessmentType, sub.SubjectName
      ORDER BY sub.SubjectName ASC, a.AssessmentID DESC`,
      args
    );
    res.json(rows);
  })
);

apiRouter.post(
  '/assessments',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { subjectId, title, maxScore, assessmentType, reason } = req.body as {
      subjectId?: number;
      title?: string;
      maxScore?: number;
      assessmentType?: string;
      reason?: string;
    };

    if (!subjectId || !title?.trim() || !maxScore || Number(maxScore) <= 0 || !assessmentType?.trim()) {
      res.status(400).json({ error: 'Subject, title, type, and positive max score are required.' });
      return;
    }

    if (user.role === 'teacher') {
      const teaches = await db.queryOne(
        'SELECT SectionSubjectID FROM SectionSubject WHERE SubjectID = ? AND TeacherID = ? LIMIT 1',
        [Number(subjectId), user.id]
      );
      if (!teaches) {
        res.status(403).json({ error: 'Access denied: you do not teach this subject.' });
        return;
      }
    }

    const info = await db.execute(
      'INSERT INTO Assessment (SubjectID, Title, MaxScore, AssessmentType) VALUES (?, ?, ?, ?)',
      [Number(subjectId), title.trim(), Number(maxScore), assessmentType.trim()]
    );

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason?.trim() || `Created assessment ${title.trim()}`,
      actionType: 'ADD',
      affectedTable: 'Assessment',
      affectedRecordId: info.insertId,
      status: user.role === 'admin' ? 'Approved' : 'Pending',
    });

    res.status(201).json(
      await db.queryOne('SELECT * FROM Assessment WHERE AssessmentID = ?', [info.insertId])
    );
  })
);

apiRouter.get(
  '/scores',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sectionId, studentId, subjectId, assessmentId, search, sortBy, sortDir } = req.query as Record<
      string,
      string | undefined
    >;

    const sortMap: Record<string, string> = {
      StudentName: 'st.Name',
      SubjectName: 'sub.SubjectName',
      AssessmentTitle: 'a.Title',
      Score: 'sc.Score',
      percentage: '(sc.Score * 1.0 / a.MaxScore)',
    };
    const orderCol = sortMap[sortBy || 'StudentName'] || 'st.Name';
    const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

    const conditions = ["st.Status = 'Active'"];
    const args: Array<string | number> = [];

    if (user.role === 'teacher') {
      conditions.push(
        'EXISTS (SELECT 1 FROM SectionSubject ss WHERE ss.SectionID = st.SectionID AND ss.TeacherID = ?)'
      );
      args.push(user.id);
    }
    if (sectionId && sectionId !== 'all') {
      conditions.push('st.SectionID = ?');
      args.push(Number(sectionId));
    }
    if (studentId && studentId !== 'all') {
      conditions.push('sc.StudentID = ?');
      args.push(Number(studentId));
    }
    if (subjectId && subjectId !== 'all') {
      conditions.push('a.SubjectID = ?');
      args.push(Number(subjectId));
    }
    if (assessmentId && assessmentId !== 'all') {
      conditions.push('sc.AssessmentID = ?');
      args.push(Number(assessmentId));
    }
    if (search?.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        "(lower(st.Name) LIKE ? OR lower(sub.SubjectName) LIKE ? OR lower(a.Title) LIKE ? OR lower(COALESCE(sc.Remarks, '')) LIKE ?)"
      );
      args.push(q, q, q, q);
    }

    const sql = `
      SELECT
        sc.ScoreID,
        sc.AssessmentID,
        sc.StudentID,
        sc.Score,
        sc.Remarks,
        st.Name AS StudentName,
        st.SectionID,
        s.SectionName,
        a.SubjectID,
        sub.SubjectName,
        a.Title AS AssessmentTitle,
        a.AssessmentType,
        a.MaxScore
      FROM StudentScore sc
      JOIN Student st ON st.StudentID = sc.StudentID
      JOIN Section s ON s.SectionID = st.SectionID
      JOIN Assessment a ON a.AssessmentID = sc.AssessmentID
      JOIN Subject sub ON sub.SubjectID = a.SubjectID
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderCol} ${dir}, sc.ScoreID ASC
    `;
    res.json(await db.query(sql, args));
  })
);

apiRouter.post(
  '/scores',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { assessmentId, studentId, score, remarks, reason } = req.body as {
      assessmentId?: number;
      studentId?: number;
      score?: number;
      remarks?: string;
      reason?: string;
    };

    if (!assessmentId || !studentId || score === undefined || Number(score) < 0) {
      res.status(400).json({ error: 'Assessment, student, and non-negative score are required.' });
      return;
    }

    const st = await db.queryOne<{ StudentID: number; SectionID: number }>(
      "SELECT StudentID, SectionID FROM Student WHERE StudentID = ? AND Status = 'Active'",
      [Number(studentId)]
    );
    if (!st) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }
    if (!(await verifySectionAccess(st.SectionID, user, res))) return;

    const assessment = await db.queryOne<{ AssessmentID: number; Title: string; MaxScore: number }>(
      'SELECT AssessmentID, Title, MaxScore FROM Assessment WHERE AssessmentID = ?',
      [Number(assessmentId)]
    );
    if (!assessment) {
      res.status(404).json({ error: 'Assessment not found.' });
      return;
    }

    const existingScore = await db.queryOne<{ ScoreID: number }>(
      'SELECT ScoreID FROM StudentScore WHERE AssessmentID = ? AND StudentID = ?',
      [Number(assessmentId), Number(studentId)]
    );

    if (existingScore) {
      if (user.role === 'teacher' && (!reason || reason.trim().length < 3)) {
        res.status(400).json({
          error: 'A valid reason (at least 3 characters) is required when editing a grade score.',
        });
        return;
      }
      await db.execute('UPDATE StudentScore SET Score = ?, Remarks = ? WHERE ScoreID = ?', [
        Number(score),
        remarks?.trim() || null,
        existingScore.ScoreID,
      ]);
      await recordLog({
        teacherId: user.role === 'teacher' ? user.id : null,
        adminId: user.role === 'admin' ? user.id : null,
        reason: reason?.trim() || `Updated score on ${assessment.Title}`,
        actionType: 'EDIT',
        affectedTable: 'StudentScore',
        affectedRecordId: existingScore.ScoreID,
        status: user.role === 'admin' ? 'Approved' : 'Pending',
      });
      res.json(
        await db.queryOne('SELECT * FROM StudentScore WHERE ScoreID = ?', [existingScore.ScoreID])
      );
      return;
    }

    const info = await db.execute(
      'INSERT INTO StudentScore (AssessmentID, StudentID, Score, Remarks) VALUES (?, ?, ?, ?)',
      [Number(assessmentId), Number(studentId), Number(score), remarks?.trim() || null]
    );
    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason?.trim() || `Recorded score on ${assessment.Title}`,
      actionType: 'ADD',
      affectedTable: 'StudentScore',
      affectedRecordId: info.insertId,
      status: user.role === 'admin' ? 'Approved' : 'Pending',
    });
    res.status(201).json(await db.queryOne('SELECT * FROM StudentScore WHERE ScoreID = ?', [info.insertId]));
  })
);

apiRouter.put(
  '/scores/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const scoreId = Number(req.params.id);
    const { score, remarks, reason } = req.body as {
      score?: number;
      remarks?: string;
      reason?: string;
    };

    const existing = await db.queryOne<{ ScoreID: number; StudentID: number; SectionID: number }>(
      `SELECT sc.ScoreID, sc.StudentID, st.SectionID
       FROM StudentScore sc
       JOIN Student st ON st.StudentID = sc.StudentID
       WHERE sc.ScoreID = ?`,
      [scoreId]
    );
    if (!existing) {
      res.status(404).json({ error: 'Score record not found.' });
      return;
    }
    if (!(await verifySectionAccess(existing.SectionID, user, res))) return;

    if (user.role === 'teacher' && (!reason || reason.trim().length < 3)) {
      res.status(400).json({
        error: 'A valid reason (at least 3 characters) is required to edit a grade.',
      });
      return;
    }
    if (score === undefined || Number(score) < 0) {
      res.status(400).json({ error: 'Valid non-negative score is required.' });
      return;
    }

    await db.execute('UPDATE StudentScore SET Score = ?, Remarks = ? WHERE ScoreID = ?', [
      Number(score),
      remarks?.trim() || null,
      scoreId,
    ]);

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason?.trim() || 'Administrative score adjustment',
      actionType: 'EDIT',
      affectedTable: 'StudentScore',
      affectedRecordId: scoreId,
      status: user.role === 'admin' ? 'Approved' : 'Pending',
    });

    res.json(await db.queryOne('SELECT * FROM StudentScore WHERE ScoreID = ?', [scoreId]));
  })
);

apiRouter.delete(
  '/scores/:id',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const scoreId = Number(req.params.id);

    const existing = await db.queryOne<{ ScoreID: number; SectionID: number }>(
      `SELECT sc.ScoreID, st.SectionID
       FROM StudentScore sc
       JOIN Student st ON st.StudentID = sc.StudentID
       WHERE sc.ScoreID = ?`,
      [scoreId]
    );
    if (!existing) {
      res.status(404).json({ error: 'Score record not found.' });
      return;
    }
    if (!(await verifySectionAccess(existing.SectionID, user, res))) return;

    const reason = (req.body?.reason as string | undefined) || (req.query.reason as string | undefined);
    if (!reason || reason.trim().length < 3) {
      res.status(400).json({
        error: 'A valid reason (at least 3 characters) is required to delete a grade.',
      });
      return;
    }

    await db.execute('DELETE FROM StudentScore WHERE ScoreID = ?', [scoreId]);

    await recordLog({
      teacherId: user.role === 'teacher' ? user.id : null,
      adminId: user.role === 'admin' ? user.id : null,
      reason: reason.trim(),
      actionType: 'DELETE',
      affectedTable: 'StudentScore',
      affectedRecordId: scoreId,
      status: user.role === 'admin' ? 'Approved' : 'Pending',
    });

    res.json({ ok: true });
  })
);

apiRouter.get(
  '/attendance',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sectionId, subjectId, date } = req.query as {
      sectionId?: string;
      subjectId?: string;
      date?: string;
    };

    if (!sectionId || !subjectId) {
      res.status(400).json({ error: 'sectionId and subjectId are required.' });
      return;
    }
    if (!(await verifySectionAccess(Number(sectionId), user, res))) return;

    const targetDate = date || new Date().toISOString().slice(0, 10);
    const rows = await db.query(
      `SELECT
        att.AttendanceID,
        st.StudentID,
        ? AS SubjectID,
        ? AS Date,
        COALESCE(att.Status, 'Present') AS Status,
        st.Name AS StudentName
      FROM Student st
      LEFT JOIN Attendance att
        ON att.StudentID = st.StudentID
        AND att.SubjectID = ?
        AND att.Date = ?
      WHERE st.SectionID = ? AND st.Status = 'Active'
      ORDER BY st.Name ASC`,
      [Number(subjectId), targetDate, Number(subjectId), targetDate, Number(sectionId)]
    );
    res.json(rows);
  })
);

apiRouter.post(
  '/attendance',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { sectionId, subjectId, date, records } = req.body as {
      sectionId?: number;
      subjectId?: number;
      date?: string;
      records?: Array<{ studentId: number; status: 'Present' | 'Absent' | 'Late' | 'Excused' }>;
    };

    if (!sectionId || !subjectId || !date || !Array.isArray(records)) {
      res.status(400).json({ error: 'sectionId, subjectId, date, and records are required.' });
      return;
    }
    if (!(await verifySectionAccess(Number(sectionId), user, res))) return;

    for (const r of records) {
      if (!['Present', 'Absent', 'Late', 'Excused'].includes(r.status)) continue;
      const existing = await db.queryOne<{ AttendanceID: number }>(
        'SELECT AttendanceID FROM Attendance WHERE StudentID = ? AND SubjectID = ? AND Date = ?',
        [Number(r.studentId), Number(subjectId), date]
      );
      if (existing) {
        await db.execute('UPDATE Attendance SET Status = ? WHERE AttendanceID = ?', [
          r.status,
          existing.AttendanceID,
        ]);
      } else {
        await db.execute(
          'INSERT INTO Attendance (StudentID, SubjectID, Date, Status) VALUES (?, ?, ?, ?)',
          [Number(r.studentId), Number(subjectId), date, r.status]
        );
      }
    }
    res.json({ ok: true, count: records.length });
  })
);

// ==================== LOGS, ADMIN REVIEW (LAYER 4) & MAINTENANCE ====================

apiRouter.get(
  '/logs',
  requireAuth,
  asyncRoute(async (req, res) => {
    const user = req.authUser!;
    const { status, actionType, affectedTable, search, sortBy, sortDir } = req.query as Record<
      string,
      string | undefined
    >;

    const conditions: string[] = ['1=1'];
    const args: Array<string | number> = [];

    if (user.role === 'teacher') {
      conditions.push('l.TeacherID = ?');
      args.push(user.id);
    }
    if (status && status !== 'all') {
      conditions.push('l.Status = ?');
      args.push(status);
    }
    if (actionType && actionType !== 'all') {
      conditions.push('l.ActionType = ?');
      args.push(actionType);
    }
    if (affectedTable && affectedTable !== 'all') {
      conditions.push('l.AffectedTable = ?');
      args.push(affectedTable);
    }
    if (search?.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      conditions.push(
        "(lower(l.Reason) LIKE ? OR lower(l.AffectedTable) LIKE ? OR lower(COALESCE(t.Name, '')) LIKE ?)"
      );
      args.push(q, q, q);
    }

    const sortMap: Record<string, string> = {
      Timestamp: 'l.Timestamp',
      Status: 'l.Status',
      ActionType: 'l.ActionType',
      AffectedTable: 'l.AffectedTable',
      LogID: 'l.LogID',
    };
    const orderCol = sortMap[sortBy || 'Timestamp'] || 'l.Timestamp';
    const dir = sortDir === 'asc' ? 'ASC' : 'DESC';

    const sql = `
      SELECT
        l.*,
        t.Name AS TeacherName,
        a.Name AS AdminName
      FROM Log l
      LEFT JOIN Teacher t ON t.TeacherID = l.TeacherID
      LEFT JOIN Admin a ON a.AdminID = l.AdminID
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderCol} ${dir}, l.LogID ${dir}
    `;
    res.json(await db.query(sql, args));
  })
);

apiRouter.post(
  '/logs/:id/review',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const admin = req.authUser!;
    const logId = Number(req.params.id);
    const { decision } = req.body as { decision?: 'Approved' | 'Rejected' };

    if (decision !== 'Approved' && decision !== 'Rejected') {
      res.status(400).json({ error: "Decision must be 'Approved' or 'Rejected'." });
      return;
    }

    const log = await db.queryOne<{
      LogID: number;
      ActionType: string;
      AffectedTable: string;
      AffectedRecordID: number;
      Status: string;
    }>('SELECT * FROM Log WHERE LogID = ?', [logId]);

    if (!log) {
      res.status(404).json({ error: 'Log entry not found.' });
      return;
    }
    if (log.Status !== 'Pending') {
      res.status(400).json({ error: 'Only Pending log entries can be reviewed.' });
      return;
    }

    if (decision === 'Approved' && log.ActionType === 'DELETE' && log.AffectedTable === 'Student') {
      await db.execute("UPDATE Student SET Status = 'Deleted' WHERE StudentID = ?", [
        log.AffectedRecordID,
      ]);
    } else if (decision === 'Rejected') {
      if (log.ActionType === 'DELETE' && log.AffectedTable === 'Student') {
        await db.execute("UPDATE Student SET Status = 'Active' WHERE StudentID = ?", [
          log.AffectedRecordID,
        ]);
      } else if (log.ActionType === 'ADD' && log.AffectedTable === 'Student') {
        await db.execute("UPDATE Student SET Status = 'Archived' WHERE StudentID = ?", [
          log.AffectedRecordID,
        ]);
      }
    }

    await db.execute('UPDATE Log SET AdminID = ?, Status = ? WHERE LogID = ?', [
      admin.id,
      decision,
      logId,
    ]);

    const updated = await db.queryOne(
      `SELECT l.*, t.Name AS TeacherName, a.Name AS AdminName
       FROM Log l
       LEFT JOIN Teacher t ON t.TeacherID = l.TeacherID
       LEFT JOIN Admin a ON a.AdminID = l.AdminID
       WHERE l.LogID = ?`,
      [logId]
    );
    res.json(updated);
  })
);

apiRouter.get(
  '/logs/maintenance',
  requireAdmin,
  asyncRoute(async (_req, res) => {
    const totalLogs = (await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM Log'))?.c ?? 0;
    const pendingCount =
      (
        await db.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM Log WHERE Status = 'Pending'")
      )?.c ?? 0;
    const resolvedCount =
      (
        await db.queryOne<{ c: number }>(
          "SELECT COUNT(*) as c FROM Log WHERE Status IN ('Approved', 'Rejected')"
        )
      )?.c ?? 0;
    const systemEventCount =
      (await db.queryOne<{ c: number }>("SELECT COUNT(*) as c FROM Log WHERE Status = 'Logged'"))
        ?.c ?? 0;

    res.json({
      totalLogs,
      pendingCount,
      resolvedCount,
      systemEventCount,
      maxThreshold: logMaxThreshold,
      needsMaintenance: totalLogs >= logMaxThreshold,
    });
  })
);

apiRouter.post(
  '/logs/maintenance',
  requireAdmin,
  asyncRoute(async (req, res) => {
    const admin = req.authUser!;
    const { action, maxThreshold, keepCount } = req.body as {
      action?: 'update_settings' | 'prune_resolved' | 'prune_system_events';
      maxThreshold?: number;
      keepCount?: number;
    };

    if (maxThreshold !== undefined) {
      logMaxThreshold = Math.max(10, Math.min(5000, Number(maxThreshold)));
    }

    let deletedCount = 0;
    if (action === 'prune_system_events') {
      const result = await db.execute("DELETE FROM Log WHERE Status = 'Logged'");
      deletedCount = result.affectedRows;
    } else if (action === 'prune_resolved') {
      const keep = Math.max(0, Number(keepCount ?? 10));
      const nonPending = await db.query<{ LogID: number }>(
        "SELECT LogID FROM Log WHERE Status != 'Pending' ORDER BY Timestamp DESC, LogID DESC"
      );
      const idsToDelete = nonPending.slice(keep).map((r) => r.LogID);
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => '?').join(',');
        const result = await db.execute(
          `DELETE FROM Log WHERE LogID IN (${placeholders})`,
          idsToDelete
        );
        deletedCount = result.affectedRows;
      }
    }

    if (action === 'prune_resolved' || action === 'prune_system_events') {
      await recordLog({
        adminId: admin.id,
        reason: `Cleaned ${deletedCount} non-pending log entries`,
        actionType: 'CLEANUP',
        affectedTable: 'Log',
        affectedRecordId: 0,
        status: 'Logged',
      });
    }

    res.json({ ok: true, deletedCount });
  })
);
