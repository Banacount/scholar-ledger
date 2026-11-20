import fs from 'node:fs';
import path from 'node:path';
import type { Pool, PoolOptions, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { hashPassword } from './auth.ts';

export type DbDriver = 'mysql' | 'sqlite';

interface SqliteDbLike {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number | bigint };
  };
}

declare global {
  var __smsMysqlPool: Pool | undefined;
  var __smsSqliteDb: SqliteDbLike | undefined;
  var __smsInitPromise: Promise<void> | undefined;
}

function getMysqlUri(): string | null {
  const uri =
    process.env.SERVICE_URI?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.MYSQL_URL?.trim();
  if (uri && uri.startsWith('mysql')) {
    return uri;
  }
  return null;
}

export function getDbDriver(): DbDriver {
  if (getMysqlUri() || process.env.MYSQL_HOST?.trim()) {
    return 'mysql';
  }
  return 'sqlite';
}

export function nowSqlTimestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function resolveSslConfig(sslModeFromUri?: string | null): PoolOptions['ssl'] | undefined {
  const rawCa = process.env.MYSQL_SSL_CA?.trim();
  if (rawCa) {
    const pem = rawCa.includes('-----BEGIN')
      ? rawCa.replace(/\\n/g, '\n')
      : Buffer.from(rawCa, 'base64').toString('utf8');
    return {
      ca: pem,
      rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  }

  const sslRequired =
    sslModeFromUri?.toUpperCase() === 'REQUIRED' ||
    sslModeFromUri?.toUpperCase() === 'VERIFY_CA' ||
    sslModeFromUri?.toUpperCase() === 'VERIFY_IDENTITY' ||
    process.env.MYSQL_SSL_REQUIRED === 'true' ||
    Boolean(getMysqlUri()?.includes('aivencloud.com'));

  if (sslRequired) {
    return {
      rejectUnauthorized: false,
    };
  }

  return undefined;
}

async function getMysqlPool(): Promise<Pool> {
  if (globalThis.__smsMysqlPool) {
    return globalThis.__smsMysqlPool;
  }

  const mysql = await import('mysql2/promise');
  const uri = getMysqlUri();

  let options: PoolOptions;
  if (uri) {
    const parsed = new URL(uri);
    const sslMode = parsed.searchParams.get('ssl-mode') || parsed.searchParams.get('sslmode');
    options = {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, '') || 'defaultdb',
      ssl: resolveSslConfig(sslMode),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      dateStrings: true,
      decimalNumbers: true,
      multipleStatements: false,
    };
  } else {
    options = {
      host: process.env.MYSQL_HOST!.trim(),
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER?.trim() || 'avnadmin',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE?.trim() || 'defaultdb',
      ssl: resolveSslConfig('REQUIRED'),
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      dateStrings: true,
      decimalNumbers: true,
      multipleStatements: false,
    };
  }

  globalThis.__smsMysqlPool = mysql.createPool(options);
  return globalThis.__smsMysqlPool;
}

async function getSqliteDb(): Promise<SqliteDbLike> {
  if (globalThis.__smsSqliteDb) {
    return globalThis.__smsSqliteDb;
  }
  const { DatabaseSync } = await import('node:sqlite');
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'sms.db');
  let sqlite = new DatabaseSync(dbPath);

  // If an earlier dev database with snake_case tables exists without PascalCase tables, recreate cleanly
  const oldTable = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='courses'")
    .get() as { name: string } | undefined;
  const newTable = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Course'")
    .get() as { name: string } | undefined;
  if (oldTable && !newTable) {
    sqlite.close();
    fs.unlinkSync(dbPath);
    sqlite = new DatabaseSync(dbPath);
  }

  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  globalThis.__smsSqliteDb = sqlite as unknown as SqliteDbLike;
  return globalThis.__smsSqliteDb;
}

export const db = {
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (getDbDriver() === 'mysql') {
      const pool = await getMysqlPool();
      const [rows] = await pool.query<RowDataPacket[]>(sql, params);
      return rows as unknown as T[];
    }
    const sqlite = await getSqliteDb();
    return sqlite.prepare(sql).all(...params) as T[];
  },

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<T | undefined> {
    if (getDbDriver() === 'mysql') {
      const pool = await getMysqlPool();
      const [rows] = await pool.query<RowDataPacket[]>(sql, params);
      return (rows[0] as unknown as T) ?? undefined;
    }
    const sqlite = await getSqliteDb();
    return (sqlite.prepare(sql).get(...params) as T) ?? undefined;
  },

  async execute(
    sql: string,
    params: unknown[] = []
  ): Promise<{ insertId: number; affectedRows: number }> {
    if (getDbDriver() === 'mysql') {
      const pool = await getMysqlPool();
      const [res] = await pool.query<ResultSetHeader>(sql, params);
      return {
        insertId: Number(res.insertId || 0),
        affectedRows: Number(res.affectedRows || 0),
      };
    }
    const sqlite = await getSqliteDb();
    const res = sqlite.prepare(sql).run(...params);
    return {
      insertId: Number(res.lastInsertRowid || 0),
      affectedRows: Number(res.changes || 0),
    };
  },
};

const MYSQL_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS \`Course\` (
    \`CourseID\` int PRIMARY KEY AUTO_INCREMENT,
    \`CourseName\` varchar(100) UNIQUE NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`Subject\` (
    \`SubjectID\` int PRIMARY KEY AUTO_INCREMENT,
    \`SubjectName\` varchar(100) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`CourseSubject\` (
    \`SubjectID\` int NOT NULL,
    \`CourseID\` int NOT NULL,
    PRIMARY KEY (\`CourseID\`, \`SubjectID\`),
    FOREIGN KEY (\`CourseID\`) REFERENCES \`Course\` (\`CourseID\`),
    FOREIGN KEY (\`SubjectID\`) REFERENCES \`Subject\` (\`SubjectID\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`Teacher\` (
    \`TeacherID\` int PRIMARY KEY AUTO_INCREMENT,
    \`Name\` varchar(100) NOT NULL,
    \`Email\` varchar(100) UNIQUE NOT NULL,
    \`Password\` varchar(255) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`Admin\` (
    \`AdminID\` int PRIMARY KEY AUTO_INCREMENT,
    \`Name\` varchar(100) NOT NULL,
    \`Email\` varchar(100) UNIQUE NOT NULL,
    \`Password\` varchar(255) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS \`Section\` (
    \`SectionID\` int PRIMARY KEY AUTO_INCREMENT,
    \`CourseID\` int NOT NULL,
    \`SectionName\` varchar(50) NOT NULL,
    FOREIGN KEY (\`CourseID\`) REFERENCES \`Course\` (\`CourseID\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`SectionSubject\` (
    \`SectionSubjectID\` int PRIMARY KEY AUTO_INCREMENT,
    \`SectionID\` int NOT NULL,
    \`SubjectID\` int NOT NULL,
    \`TeacherID\` int NOT NULL,
    FOREIGN KEY (\`SectionID\`) REFERENCES \`Section\` (\`SectionID\`),
    FOREIGN KEY (\`SubjectID\`) REFERENCES \`Subject\` (\`SubjectID\`),
    FOREIGN KEY (\`TeacherID\`) REFERENCES \`Teacher\` (\`TeacherID\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`Student\` (
    \`StudentID\` int PRIMARY KEY AUTO_INCREMENT,
    \`SectionID\` int NOT NULL,
    \`Name\` varchar(100) NOT NULL,
    \`Email\` varchar(100) UNIQUE,
    \`Status\` varchar(20) DEFAULT 'Active',
    FOREIGN KEY (\`SectionID\`) REFERENCES \`Section\` (\`SectionID\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`Assessment\` (
    \`AssessmentID\` int PRIMARY KEY AUTO_INCREMENT,
    \`SubjectID\` int NOT NULL,
    \`Title\` varchar(100) NOT NULL,
    \`MaxScore\` decimal(5,2) NOT NULL,
    \`AssessmentType\` varchar(50) NOT NULL,
    FOREIGN KEY (\`SubjectID\`) REFERENCES \`Subject\` (\`SubjectID\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`StudentScore\` (
    \`ScoreID\` int PRIMARY KEY AUTO_INCREMENT,
    \`AssessmentID\` int NOT NULL,
    \`StudentID\` int NOT NULL,
    \`Score\` decimal(5,2) NOT NULL,
    \`Remarks\` varchar(255),
    FOREIGN KEY (\`AssessmentID\`) REFERENCES \`Assessment\` (\`AssessmentID\`),
    FOREIGN KEY (\`StudentID\`) REFERENCES \`Student\` (\`StudentID\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`Attendance\` (
    \`AttendanceID\` int PRIMARY KEY AUTO_INCREMENT,
    \`StudentID\` int NOT NULL,
    \`SubjectID\` int NOT NULL,
    \`Date\` date NOT NULL,
    \`Status\` varchar(20) NOT NULL,
    FOREIGN KEY (\`StudentID\`) REFERENCES \`Student\` (\`StudentID\`),
    FOREIGN KEY (\`SubjectID\`) REFERENCES \`Subject\` (\`SubjectID\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`Log\` (
    \`LogID\` int PRIMARY KEY AUTO_INCREMENT,
    \`TeacherID\` int,
    \`AdminID\` int,
    \`Reason\` varchar(255) NOT NULL,
    \`ActionType\` varchar(10) NOT NULL,
    \`AffectedTable\` varchar(20) NOT NULL,
    \`AffectedRecordID\` int NOT NULL,
    \`Timestamp\` datetime DEFAULT CURRENT_TIMESTAMP,
    \`Status\` varchar(10) DEFAULT 'Pending',
    FOREIGN KEY (\`TeacherID\`) REFERENCES \`Teacher\` (\`TeacherID\`),
    FOREIGN KEY (\`AdminID\`) REFERENCES \`Admin\` (\`AdminID\`)
  )`,
];

const SQLITE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS Course (
    CourseID INTEGER PRIMARY KEY AUTOINCREMENT,
    CourseName TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Subject (
    SubjectID INTEGER PRIMARY KEY AUTOINCREMENT,
    SubjectName TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS CourseSubject (
    SubjectID INTEGER NOT NULL REFERENCES Subject(SubjectID),
    CourseID INTEGER NOT NULL REFERENCES Course(CourseID),
    PRIMARY KEY (CourseID, SubjectID)
  );

  CREATE TABLE IF NOT EXISTS Teacher (
    TeacherID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Email TEXT UNIQUE NOT NULL,
    Password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Admin (
    AdminID INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Email TEXT UNIQUE NOT NULL,
    Password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Section (
    SectionID INTEGER PRIMARY KEY AUTOINCREMENT,
    CourseID INTEGER NOT NULL REFERENCES Course(CourseID),
    SectionName TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS SectionSubject (
    SectionSubjectID INTEGER PRIMARY KEY AUTOINCREMENT,
    SectionID INTEGER NOT NULL REFERENCES Section(SectionID),
    SubjectID INTEGER NOT NULL REFERENCES Subject(SubjectID),
    TeacherID INTEGER NOT NULL REFERENCES Teacher(TeacherID)
  );

  CREATE TABLE IF NOT EXISTS Student (
    StudentID INTEGER PRIMARY KEY AUTOINCREMENT,
    SectionID INTEGER NOT NULL REFERENCES Section(SectionID),
    Name TEXT NOT NULL,
    Email TEXT UNIQUE,
    Status TEXT DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS Assessment (
    AssessmentID INTEGER PRIMARY KEY AUTOINCREMENT,
    SubjectID INTEGER NOT NULL REFERENCES Subject(SubjectID),
    Title TEXT NOT NULL,
    MaxScore REAL NOT NULL,
    AssessmentType TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS StudentScore (
    ScoreID INTEGER PRIMARY KEY AUTOINCREMENT,
    AssessmentID INTEGER NOT NULL REFERENCES Assessment(AssessmentID),
    StudentID INTEGER NOT NULL REFERENCES Student(StudentID),
    Score REAL NOT NULL,
    Remarks TEXT
  );

  CREATE TABLE IF NOT EXISTS Attendance (
    AttendanceID INTEGER PRIMARY KEY AUTOINCREMENT,
    StudentID INTEGER NOT NULL REFERENCES Student(StudentID),
    SubjectID INTEGER NOT NULL REFERENCES Subject(SubjectID),
    Date TEXT NOT NULL,
    Status TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Log (
    LogID INTEGER PRIMARY KEY AUTOINCREMENT,
    TeacherID INTEGER REFERENCES Teacher(TeacherID),
    AdminID INTEGER REFERENCES Admin(AdminID),
    Reason TEXT NOT NULL,
    ActionType TEXT NOT NULL,
    AffectedTable TEXT NOT NULL,
    AffectedRecordID INTEGER NOT NULL,
    Timestamp TEXT DEFAULT (datetime('now')),
    Status TEXT DEFAULT 'Pending'
  );
`;

export async function initDatabase(): Promise<void> {
  if (globalThis.__smsInitPromise) {
    return globalThis.__smsInitPromise;
  }

  globalThis.__smsInitPromise = (async () => {
    if (getDbDriver() === 'mysql') {
      for (const stmt of MYSQL_SCHEMA_STATEMENTS) {
        await db.execute(stmt);
      }
    } else {
      const sqlite = await getSqliteDb();
      sqlite.exec(SQLITE_SCHEMA_SQL);
    }
    await seedIfEmpty();
  })().catch((err) => {
    globalThis.__smsInitPromise = undefined;
    throw err;
  });

  return globalThis.__smsInitPromise;
}

async function seedIfEmpty(): Promise<void> {
  const courseCount = await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM Course');
  if ((courseCount?.c ?? 0) > 0) return;

  const defaultTeacherHash = hashPassword('teacher123');
  const defaultAdminHash = hashPassword('admin123');

  const courses = ['BSIT', 'BSCS', 'BSIS', 'BSEMC', 'BSCpE', 'BSECE', 'BSEE', 'BSCE', 'BSArch', 'BSTM'];
  for (const name of courses) {
    await db.execute('INSERT INTO Course (CourseName) VALUES (?)', [name]);
  }

  const subjects = [
    'Programming',
    'Fundamentals of Database Systems',
    'Data Structures',
    'Discrete Math',
    'Database Systems',
    'Web Systems',
    'Networking',
    'Calculus 1',
    'Tech Writing',
    'Physics',
    'Philippine History',
  ];
  for (const name of subjects) {
    await db.execute('INSERT INTO Subject (SubjectName) VALUES (?)', [name]);
  }

  const courseSubjects: Array<[number, number]> = [
    [1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7],
    [2, 1], [2, 3], [2, 4], [2, 8],
    [3, 5], [3, 8],
    [4, 9],
    [5, 10],
    [6, 10],
    [9, 11],
  ];
  for (const [cid, sid] of courseSubjects) {
    await db.execute('INSERT INTO CourseSubject (CourseID, SubjectID) VALUES (?, ?)', [cid, sid]);
  }

  const teachers: Array<[string, string]> = [
    ['Maria Reyes', 'maria.reyes@sample.ph'],
    ['Joseph Cruz', 'joseph.cruz@sample.ph'],
    ['Rhea Santos', 'rhea.santos@sample.ph'],
    ['Carlo Bautista', 'carlo.bautista@sample.ph'],
    ['Jennifer Villanueva', 'jennifer.villanueva@sample.ph'],
    ['Paolo Mendoza', 'paolo.mendoza@sample.ph'],
    ['Katrina Ramos', 'katrina.ramos@sample.ph'],
    ['Mark Flores', 'mark.flores@sample.ph'],
    ['Cheryl Navarro', 'cheryl.navarro@sample.ph'],
    ['Rodel Castillo', 'rodel.castillo@sample.ph'],
  ];
  for (const [name, email] of teachers) {
    await db.execute('INSERT INTO Teacher (Name, Email, Password) VALUES (?, ?, ?)', [
      name,
      email,
      defaultTeacherHash,
    ]);
  }

  const admins: Array<[string, string]> = [
    ['Rafael Lim', 'rafael.lim@sample.ph'],
    ['Sheila Ortega', 'sheila.ortega@sample.ph'],
    ['Ben Aquino', 'ben.aquino@sample.ph'],
    ['Diana Policarpio', 'diana.policarpio@sample.ph'],
    ['Ernesto Magsaysay', 'ernesto.magsaysay@sample.ph'],
    ['Felicia Zamora', 'felicia.zamora@sample.ph'],
    ['Gerald Tan', 'gerald.tan@sample.ph'],
    ['Hannah Lacson', 'hannah.lacson@sample.ph'],
    ['Ivan Moreno', 'ivan.moreno@sample.ph'],
    ['Janine Soriano', 'janine.soriano@sample.ph'],
  ];
  for (const [name, email] of admins) {
    await db.execute('INSERT INTO Admin (Name, Email, Password) VALUES (?, ?, ?)', [
      name,
      email,
      defaultAdminHash,
    ]);
  }

  const sections: Array<[number, string]> = [
    [1, 'IT2R2'],
    [1, 'IT2R1'],
    [2, 'CS1A'],
    [3, 'IS3B'],
    [4, 'EMC2A'],
    [5, 'CPE1A'],
    [6, 'ECE2B'],
    [7, 'EE3A'],
    [8, 'CE1C'],
    [9, 'ARCH2A'],
  ];
  for (const [cid, name] of sections) {
    await db.execute('INSERT INTO Section (CourseID, SectionName) VALUES (?, ?)', [cid, name]);
  }

  const sectionSubjects: Array<[number, number, number]> = [
    [1, 1, 1],
    [1, 2, 1],
    [1, 3, 1],
    [1, 4, 1],
    [1, 5, 1],
    [2, 6, 2],
    [2, 7, 2],
    [3, 1, 3],
    [4, 8, 4],
    [5, 9, 5],
    [6, 10, 6],
    [7, 11, 7],
    [8, 10, 8],
    [9, 8, 9],
    [10, 11, 1],
  ];
  for (const [secId, subId, tId] of sectionSubjects) {
    await db.execute(
      'INSERT INTO SectionSubject (SectionID, SubjectID, TeacherID) VALUES (?, ?, ?)',
      [secId, subId, tId]
    );
  }

  const students: Array<[number, string, string, string]> = [
    [1, 'Alyssa Cabrera', 'alyssa.cabrera@student.sample.ph', 'Active'],
    [1, 'Benedict Uy', 'benedict.uy@student.sample.ph', 'Active'],
    [1, 'Carla Pacana', 'carla.pacana@student.sample.ph', 'Active'],
    [2, 'Dennis Lagura', 'dennis.lagura@student.sample.ph', 'Active'],
    [2, 'Elaine Tumulak', 'elaine.tumulak@student.sample.ph', 'Active'],
    [3, 'Francis Abad', 'francis.abad@student.sample.ph', 'Active'],
    [4, 'Gwen Salcedo', 'gwen.salcedo@student.sample.ph', 'Active'],
    [5, 'Harvey Matunog', 'harvey.matunog@student.sample.ph', 'Active'],
    [6, 'Isabel Tan', 'isabel.tan@student.sample.ph', 'Active'],
    [7, 'Jericho Ochavillo', 'jericho.ochavillo@student.sample.ph', 'Active'],
    [8, 'Kyla Pabillore', 'kyla.pabillore@student.sample.ph', 'Active'],
    [9, 'Lorenzo Dagohoy', 'lorenzo.dagohoy@student.sample.ph', 'Archived'],
    [10, 'Maricel Ybanez', 'maricel.ybanez@student.sample.ph', 'Active'],
  ];
  for (const [secId, name, email, status] of students) {
    await db.execute('INSERT INTO Student (SectionID, Name, Email, Status) VALUES (?, ?, ?, ?)', [
      secId,
      name,
      email,
      status,
    ]);
  }

  const assessments: Array<[number, string, number, string]> = [
    [1, 'Midterm Practical Coding Exam', 20, 'Exam'],
    [3, 'Binary Trees & Stacks Evaluation', 50, 'Exam'],
    [4, 'Logic & Sets Quiz', 30, 'Quiz'],
    [5, 'Database Normalization Project', 100, 'Project'],
    [6, 'REST API Assignment', 50, 'Assignment'],
    [7, 'Subnetting Lab', 20, 'Assignment'],
    [8, 'Limits & Derivatives Quiz', 40, 'Quiz'],
    [9, 'Technical Spec Draft', 10, 'Assignment'],
    [10, 'Kinematics Lab Report', 40, 'Project'],
    [11, 'Primary Source Reflection', 20, 'Assignment'],
  ];
  for (const [subId, title, maxScore, type] of assessments) {
    await db.execute(
      'INSERT INTO Assessment (SubjectID, Title, MaxScore, AssessmentType) VALUES (?, ?, ?, ?)',
      [subId, title, maxScore, type]
    );
  }

  const scores: Array<[number, number, number, string | null]> = [
    [1, 1, 18, 'Complete test cases'],
    [2, 1, 42, 'Take-home pending review'],
    [1, 2, 15, 'Missing Activity 1, Quiz 2'],
    [3, 2, 27, null],
    [4, 3, 88, 'Missing Documentation, Peer form'],
    [5, 4, 45, null],
    [6, 5, 16, 'Missing Lab report 1'],
    [1, 6, 47, null],
    [7, 7, 34, 'Missing Problem Set 2, 3'],
    [8, 8, 9, null],
    [9, 9, 38, 'Missing Lab 1 report'],
    [10, 10, 17, 'Missing Reflection'],
  ];
  for (const [assId, stuId, score, remarks] of scores) {
    await db.execute(
      'INSERT INTO StudentScore (AssessmentID, StudentID, Score, Remarks) VALUES (?, ?, ?, ?)',
      [assId, stuId, score, remarks]
    );
  }

  const attendanceRows: Array<[number, number, string, string]> = [
    [1, 2, '2026-10-01', 'Present'],
    [2, 2, '2026-10-01', 'Late'],
    [3, 2, '2026-10-01', 'Present'],
    [1, 2, '2026-10-03', 'Present'],
    [2, 2, '2026-10-03', 'Absent'],
    [3, 2, '2026-10-03', 'Excused'],
    [4, 6, '2026-10-02', 'Present'],
    [5, 6, '2026-10-02', 'Absent'],
  ];
  for (const [stuId, subId, date, status] of attendanceRows) {
    await db.execute(
      'INSERT INTO Attendance (StudentID, SubjectID, Date, Status) VALUES (?, ?, ?, ?)',
      [stuId, subId, date, status]
    );
  }

  const logs: Array<[number | null, number | null, string, string, string, number, string, string]> = [
    [1, 1, 'Corrected score', 'EDIT', 'StudentScore', 2, '2026-09-01 09:15:00', 'Approved'],
    [2, 1, 'Student dropped', 'DELETE', 'Student', 14, '2026-09-03 10:40:00', 'Approved'],
    [3, 2, 'Late enrollee', 'ADD', 'Student', 6, '2026-09-04 14:05:00', 'Approved'],
    [4, 2, 'Wrong student encoded', 'EDIT', 'StudentScore', 9, '2026-09-08 11:20:00', 'Rejected'],
    [5, 3, 'Section merge', 'DELETE', 'Section', 5, '2026-09-10 15:45:00', 'Rejected'],
    [6, 3, 'Lab result encoded', 'ADD', 'StudentScore', 11, '2026-09-15 08:30:00', 'Approved'],
    [7, null, 'Fix surname spelling', 'EDIT', 'Student', 10, '2026-09-29 13:00:00', 'Pending'],
    [8, null, 'Match registrar format', 'EDIT', 'Student', 11, '2026-09-30 10:10:00', 'Pending'],
    [9, null, 'Student transferred', 'DELETE', 'Student', 12, '2026-10-01 09:50:00', 'Pending'],
    [1, null, 'New section opened', 'ADD', 'Section', 10, '2026-10-02 16:25:00', 'Pending'],
  ];
  for (const [tId, aId, reason, action, table, recId, ts, status] of logs) {
    await db.execute(
      'INSERT INTO Log (TeacherID, AdminID, Reason, ActionType, AffectedTable, AffectedRecordID, Timestamp, Status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [tId, aId, reason, action, table, recId, ts, status]
    );
  }
}
