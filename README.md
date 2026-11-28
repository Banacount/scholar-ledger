# ScholarLedger — Student Management System

A lightweight, full-stack **TypeScript** Student Management System built for **Teachers** and **Administrators**, featuring role-scoped academic records, mandatory reason logging for sensitive changes, an admin audit review queue, and a built-in Direct Database Control panel.

Designed to run locally out of the box with **SQLite fallback**, connect seamlessly to **Aiven MySQL** (`sms` database), and deploy cleanly to **Vercel**.

---

## Table of Contents

1. [Features](#features)
2. [Tech Stack & Project Structure](#tech-stack--project-structure)
3. [Quick Start (Run Locally)](#quick-start-run-locally)
4. [How the System Works](#how-the-system-works)
5. [Step-by-Step Tutorials](#step-by-step-tutorials)
   - [Tutorial 1: Teacher Workflow](#tutorial-1-teacher-workflow)
   - [Tutorial 2: Admin Review & Direct Database Control](#tutorial-2-admin-review--direct-database-control)
   - [Tutorial 3: Connect Your Aiven MySQL Database](#tutorial-3-connect-your-aiven-mysql-database)
   - [Tutorial 4: Reset & Re-seed via Bruno / API](#tutorial-4-reset--re-seed-via-bruno--api)
   - [Tutorial 5: Deploy to Vercel](#tutorial-5-deploy-to-vercel)
6. [Database Schema (12 Tables)](#database-schema-12-tables)
7. [Routes & API Reference](#routes--api-reference)

---

## Features

- **Role-Based Workspaces**
  - **Teachers** only see and manage sections, students, assessments, scores, and attendance linked to them via `SectionSubject`.
  - **Administrators** have system-wide visibility across all sections, catalog directories, faculty assignments, audit reviews, and direct database controls.
- **4-Layer Academic Management**
  - **Catalog:** Courses, Subjects, Course-Subject mappings, and Teachers.
  - **Sections:** Class sections with course and teacher-subject links.
  - **Students:** Enroll, transfer, sort, search, export CSV, and soft-archive students.
  - **Gradebook & Attendance:** Create assessments (`Quiz`, `Exam`, `Project`, `Assignment`), record/edit scores with remarks, and take per-subject daily attendance (`Present`, `Absent`, `Late`, `Excused`).
- **Accountability & Audit Trail**
  - Sensitive edits and deletions require a documented reason (minimum 3 characters).
  - Teacher mutations are queued in `Log` as `Pending` for Admin review; Student deletions soft-archive the record so Admins can restore it with one click if rejected.
- **Admin Database Control Panel (`/database`)**
  - Inspect all 12 tables, add/edit/delete rows directly, run single-statement SQL queries, view recent change logs, and clear or reset-and-reseed the database.
- **Zero-Config Local Mode + Cloud MySQL**
  - Uses Node's built-in SQLite (`data/sms.db`) automatically if `SERVICE_URI` is not set, or connects to Aiven MySQL (`sms`) with SSL when `SERVICE_URI` is provided.

---

## Tech Stack & Project Structure

- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Vite
- **Backend:** Express.js, TypeScript (`tsx`), Stateless HMAC-SHA256 Bearer Authentication (`scrypt` password hashing)
- **Database:** `mysql2` (Aiven MySQL) with automatic fallback to `node:sqlite`
- **Deployment:** Vercel (`vercel.json` + `/api/index.ts` serverless entry)

```text
.
├── api/
│   └── index.ts                 # Vercel serverless entry point
├── server/
│   ├── app.ts                   # Express app factory & API mounting
│   ├── auth.ts                  # scrypt password hashing & HMAC-SHA256 tokens
│   ├── db.ts                    # MySQL / SQLite connection, schema init & seeding
│   └── routes.ts                # REST API endpoints & Admin DB control
├── src/
│   ├── components/
│   │   └── StatusText.tsx       # Reusable status display component
│   │   ├── AuthScreen.tsx       # Sign-in, teacher registration & demo login buttons
│   │   ├── OverviewView.tsx     # Dashboard KPIs, section summaries & recent logs
│   │   ├── SectionsView.tsx     # Section & subject-teacher management
│   │   ├── StudentsView.tsx     # Student roster, filtering, CSV export & soft archive
│   │   ├── GradebookView.tsx    # Scores, Assessments & Attendance tabs
│   │   ├── AuditLogsView.tsx    # Audit review queue & log maintenance
│   │   ├── CatalogDirectoryView.tsx # Admin courses, subjects & teacher directory
│   │   └── DatabaseControlView.tsx  # Admin direct table CRUD, SQL console & reset
│   ├── lib/
│   │   ├── api.ts               # Fetch wrapper with Bearer token & CSV download
│   │   └── router.ts            # Lightweight SPA history router
│   ├── App.tsx                  # Main layout, navigation drawer & route resolver
│   └── types.ts                 # Shared TypeScript interfaces matching all 12 tables
├── server.ts                    # Local/Node dev & production server (port 3000)
├── vercel.json                  # Vercel API & SPA routing rules
└── .env.example                 # Minimal environment template (SERVICE_URI & SESSION_SECRET)
```

---

## Quick Start (Run Locally)

### 1. Prerequisites
- **Node.js 22+** (required for built-in `node:sqlite` support if running without MySQL)
- **npm**

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables (Optional for local testing)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

- **Option A — Fastest (SQLite fallback):** Leave `SERVICE_URI` empty or skip creating `.env`. The server will automatically create and seed `data/sms.db`.
- **Option B — Aiven MySQL:** Paste your Aiven `SERVICE_URI` into `.env` (see [Tutorial 3](#tutorial-3-connect-your-aiven-mysql-database)).

Generate a strong `SESSION_SECRET` with Node:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Start the app
```bash
npm run dev
```
Open **http://localhost:3000** in your browser. Look at your terminal logs — the server will clearly print which database it connected to:
- `[DB] Connecting to MySQL (...)` when `SERVICE_URI` is set, or
- `[DB] No SERVICE_URI configured — using local SQLite fallback (data/sms.db).` when running locally without MySQL.

### Demo Accounts (Auto-Seeded)
You can click the **Quick Demo Access** cards on the login page or enter these manually:

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Administrator** | Rafael Lim | `rafael.lim@sample.ph` | `admin123` |
| **Teacher** | Maria Reyes | `maria.reyes@sample.ph` | `teacher123` |
| **Teacher** | Joseph Cruz | `joseph.cruz@sample.ph` | `teacher123` |

---

## How the System Works

### 1. Authentication & Role Scoping
- Passwords are salted and hashed using `crypto.scryptSync`. (Pre-seeded sample SQL placeholders such as `hash_T01` / `hash_A01` are also supported for `teacher123` / `admin123`.)
- Signing in issues a signed stateless **HMAC-SHA256 Bearer token** stored in `localStorage`, making the backend compatible with serverless platforms like Vercel.
- **Teachers** can only query or mutate sections where they appear in `SectionSubject`, and can only view their own entries in **My Audit Log**.
- **Admins** have unrestricted access to all sections, students, grades, catalog setup, log reviews, and **Database Control**.

### 2. How Audit Logging & Admin Review Work
- **Immediate Execution + Accountability:** Every create, update, and delete operation executes immediately against the database and records a row in the `Log` table.
- **Pending vs. Approved Status:**
  - Actions performed by an **Admin** are logged as `Approved`.
  - Sensitive actions performed by a **Teacher** (creating sections/students/assessments, editing or deleting scores, deleting sections or students) require a written `Reason` (at least 3 characters for deletions and grade edits) and are logged as `Pending`.
  - Routine events (`LOGIN`, `REGISTER`, `Attendance` saves, `CLEANUP`) are logged as `Logged`.
- **Soft Delete & Automatic Rollback for Students:**
  - Deleting a student (`DELETE /api/students/:id`) sets `Student.Status = 'Archived'` instead of permanently deleting the row, preserving grade and attendance history.
  - When an Admin **Approves** a `Pending` student deletion, `Student.Status` transitions to `'Deleted'`.
  - When an Admin **Rejects** a `Pending` student deletion, the student is **automatically restored** to `'Active'`.
  - When an Admin **Rejects** a `Pending` student addition, the student is **automatically archived** (`'Archived'`).
- **Log Capacity Maintenance:**
  - Admins can set a log threshold (default `50`) and prune old non-pending or system (`Logged`) entries without ever deleting `Pending` review items.

---

## Step-by-Step Tutorials

### Tutorial 1: Teacher Workflow
1. **Sign in** as `maria.reyes@sample.ph` (`teacher123`), or click **New teacher? Register** to create a fresh teacher account.
2. **Manage Sections (`/sections`):**
   - View the sections assigned to you (`IT2R2`, `ARCH2A`).
   - Click **New Section** to open a section under an existing Course (you are automatically assigned via `SectionSubject`).
   - Click **View Students** on any section card to jump straight to that section's roster.
3. **Enroll & Update Students (`/students`):**
   - Click **Enroll Student** to add a student to one of your sections.
   - Use **Edit** to update a student's name/email or transfer them to another section you handle.
   - Use **Archive** to remove a student — you will be prompted for a mandatory **Reason** (e.g., `"Transferred to another campus"`).
4. **Create Assessments, Grade & Take Attendance (`/gradebook`):**
   - Switch to **Assessments** (`/gradebook/assessments`) -> click **New Assessment**, choose a subject you teach, enter a title, type, and `MaxScore`.
   - Switch to **Scores** (`/gradebook`) -> click **Record Score** to grade a student, or **Edit** / **Delete** an existing score (edits and deletions by teachers require a written reason).
   - Switch to **Attendance** (`/gradebook/attendance`) -> pick a Section, Subject, and Date, mark each student `Present`, `Late`, `Absent`, or `Excused`, and click **Save Attendance**.
5. **Track Your Changes (`/audit-logs`):**
   - Open **My Audit Log** in the sidebar to see which of your submitted changes are `Pending`, `Approved`, or `Rejected`.

---

### Tutorial 2: Admin Review & Direct Database Control
1. **Sign in** as **Rafael Lim** (`rafael.lim@sample.ph` / `admin123`).
2. **Review Teacher Changes (`/audit-logs`):**
   - Open **Audit & Review** (defaults to the `Pending` queue).
   - Click **Review** on any `Pending` row to inspect the actor, target record, and written reason, then click **Approve Action** or **Reject Action**.
   - Click **Maintenance** to configure the max log threshold or clean up resolved/`Logged` entries.
3. **Manage the Academic Catalog (`/catalog`):**
   - Add new **Courses**, **Subjects**, map subjects to courses (`CourseSubject`), and view all **Teachers** with their section and student counts.
4. **Direct Database Control (`/database`):**
   - Select any of the **12 tables** from the left list to browse live rows (passwords are masked as `••••••••`).
   - Click **Add Row**, **Edit**, or **Delete** on any row directly. (Leaving the password field as `••••••••` when editing keeps the existing password; typing a new one hashes it automatically.)
   - Switch to the **SQL Console** tab to execute single SQL statements (e.g., `SELECT * FROM Student WHERE Status = 'Active'` or `UPDATE ...`). All SQL mutations are automatically logged to `Log`.
   - Use **Clear Academic Data** to wipe all academic/teacher records while keeping Admin accounts, or **Reset & Re-seed Defaults** to restore the sample dataset.

---

### Tutorial 3: Connect Your Aiven MySQL Database
1. In your **Aiven Console**, make sure your MySQL service has a database named **`sms`** created.
2. Copy your Aiven **Service URI** (it usually looks like `mysql://avnadmin:PASSWORD@host.aivencloud.com:PORT/defaultdb?ssl-mode=REQUIRED`).
3. Put it in your `.env` file:
   ```env
   SERVICE_URI="mysql://avnadmin:YOUR_PASSWORD@your-mysql-host.aivencloud.com:PORT/sms?ssl-mode=REQUIRED"
   SESSION_SECRET="your-64-char-random-hex-secret"
   ```
   > **Note:** Even if your Aiven URI ends with `/defaultdb`, ScholarLedger automatically routes queries to the **`sms`** database unless `MYSQL_DATABASE` or another non-default database name is specified in the path.
4. Start the server (`npm run dev`). On startup, it verifies all 12 tables exist (`CREATE TABLE IF NOT EXISTS`) and automatically seeds the default courses, subjects, teachers, admins, sections, students, assessments, scores, attendance, and sample logs if `Course` is empty.

---

### Tutorial 4: Reset & Re-seed via Bruno / API
You can wipe and re-seed the database externally using **Bruno** or `curl` via `POST /api/admin/db/clear`.

- **Local URL:** `http://localhost:3000/api/admin/db/clear`
- **Deployed URL:** `https://your-app.vercel.app/api/admin/db/clear`
- **Method:** `POST`
- **Headers:**
  - `Content-Type: application/json`
  - **Authentication (pick one):**
    - `Authorization: Bearer <admin_token>`, **or**
    - `x-setup-secret: <your SESSION_SECRET>`
    - *(If the `Admin` table currently has `0` rows, the endpoint allows bootstrapping without a token.)*
- **Body (Reset & Re-seed):**
  ```json
  {
    "mode": "reseed",
    "includeAdmins": true
  }
  ```
- **Body (Clear Academic Data Only):**
  ```json
  {
    "mode": "academic"
  }
  ```

---

### Tutorial 5: Deploy to Vercel
1. **Push this repository to GitHub.**
2. In the **Vercel Dashboard**, click **Add New -> Project** and import your GitHub repo.
3. Add the following **Environment Variables** in Vercel Project Settings:
   - `SERVICE_URI` = your Aiven MySQL connection string pointing to `/sms?ssl-mode=REQUIRED`
   - `SESSION_SECRET` = your generated 32+ character random secret
   > **Important:** Do not skip `SERVICE_URI` on Vercel — serverless functions do not persist local SQLite files across deployments.
4. Click **Deploy**.
   - `vercel.json` automatically builds the Vite frontend (`npm run build`), routes `/api/*` requests to `/api/index.ts`, and rewrites all frontend routes (`/overview`, `/sections`, `/gradebook`, `/database`, etc.) to `/index.html`.
5. Verify deployment by visiting `https://your-app.vercel.app/api/health` — it should return `{"ok":true,"database":"mysql","target":"MySQL (.../sms)"}`.

---

## Database Schema (12 Tables)

All table and column names use exact PascalCase matching the MySQL schema:

| Layer | Table | Purpose |
| :--- | :--- | :--- |
| **Catalog** | `Course` | Degree programs (`CourseID`, `CourseName`) |
| **Catalog** | `Subject` | Academic subjects (`SubjectID`, `SubjectName`) |
| **Catalog** | `CourseSubject` | Links subjects to courses (`CourseID`, `SubjectID`) |
| **Accounts** | `Teacher` | Faculty accounts (`TeacherID`, `Name`, `Email`, `Password`) |
| **Accounts** | `Admin` | Administrator accounts (`AdminID`, `Name`, `Email`, `Password`) |
| **Sections** | `Section` | Class sections (`SectionID`, `CourseID`, `SectionName`) |
| **Sections** | `SectionSubject` | Assigns a Teacher + Subject to a Section |
| **Students** | `Student` | Enrolled students (`StudentID`, `SectionID`, `Name`, `Email`, `Status`) |
| **Records** | `Assessment` | Exams, quizzes, projects, assignments per subject |
| **Records** | `StudentScore` | Student grades & remarks per assessment |
| **Records** | `Attendance` | Daily attendance status per student & subject |
| **Audit** | `Log` | Change history, reasons, actor IDs & `Pending`/`Approved`/`Rejected`/`Logged` status |

---

## Routes & API Reference

### Frontend Routes (SPA)
| Path | Access | View |
| :--- | :--- | :--- |
| `/login`, `/register` | Public | Sign-in & Teacher registration |
| `/overview` | Teacher & Admin | Metrics, section averages & recent changes |
| `/sections` | Teacher & Admin | Section management |
| `/students`, `/sections/:id/students` | Teacher & Admin | Student roster & soft archive |
| `/gradebook` | Teacher & Admin | Student scores ledger |
| `/gradebook/assessments` | Teacher & Admin | Assessment definitions |
| `/gradebook/attendance` | Teacher & Admin | Daily attendance tracker |
| `/audit-logs` | Teacher & Admin | Audit log & Admin approval queue |
| `/catalog` | Admin only | Courses, subjects & faculty directory |
| `/database` | Admin only | Direct DB table editor, SQL console & reset |

### Core Backend Endpoints (`/api/*`)
| Endpoint | Auth | Description |
| :--- | :--- | :--- |
| `GET /api/health` | Public | Health check + active DB driver & target |
| `POST /api/auth/login`, `/register` | Public | Authenticate or register a teacher |
| `GET /api/auth/me` | Authenticated | Verify Bearer token & return current user |
| `GET /api/dashboard` | Authenticated | Role-scoped overview metrics & summaries |
| `GET/POST/PUT/DELETE /api/sections` | Authenticated | Section CRUD (teacher-scoped) |
| `GET/POST/PUT/DELETE /api/students` | Authenticated | Student CRUD & soft archive (`Status = 'Archived'`) |
| `GET/POST /api/assessments` | Authenticated | List or create subject assessments |
| `GET/POST/PUT/DELETE /api/scores` | Authenticated | Gradebook CRUD (reason required for teacher edit/delete) |
| `GET/POST /api/attendance` | Authenticated | Fetch or batch-save attendance for a date |
| `GET /api/logs` | Authenticated | Filtered audit logs (teacher-scoped or all for Admin) |
| `POST /api/logs/:id/review` | Admin | Approve or reject a `Pending` log entry |
| `GET/POST /api/logs/maintenance` | Admin | Configure threshold & prune non-pending logs |
| `GET/POST/PUT/DELETE /api/admin/db/*` | Admin | Table overview, row CRUD, single-statement SQL console |
| `POST /api/admin/db/clear` | Admin / Setup Secret | Clear academic tables or reset & re-seed defaults |

### Members 
* Bryle Jay M. Palitoc
