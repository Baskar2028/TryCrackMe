import "dotenv/config";

import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { Server } from "socket.io";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

import { QUESTIONS, QUESTION_MAP } from "./questions.js";

const PORT = Number(process.env.PORT || 5000);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const DURATION = Number(process.env.EVENT_DURATION_SECONDS || 1800);

const dbDir = path.join(process.cwd(), "database");
fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(path.join(dbDir, "try-crack-me.sqlite"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id TEXT UNIQUE,
  password_hash TEXT,
  name TEXT,
  college TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  status TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  start_time TEXT,
  pause_time TEXT,
  total_paused_ms INTEGER NOT NULL DEFAULT 0,
  end_time TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  language TEXT,
  title TEXT,
  description TEXT,
  input_format TEXT,
  starter_code TEXT,
  max_marks INTEGER,
  position INTEGER
);

CREATE TABLE IF NOT EXISTS participant_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  current_question TEXT,
  last_score_at TEXT,
  last_activity TEXT,
  warnings_count INTEGER DEFAULT 0,
  UNIQUE(participant_id, event_id),
  FOREIGN KEY(participant_id) REFERENCES participants(id),
  FOREIGN KEY(event_id) REFERENCES event(id)
);

CREATE TABLE IF NOT EXISTS participant_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  code TEXT NOT NULL,
  solved INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  bonus INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id, question_id),
  FOREIGN KEY(session_id)
    REFERENCES participant_sessions(id)
    ON DELETE CASCADE,
  FOREIGN KEY(question_id)
    REFERENCES questions(id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  passed_public INTEGER NOT NULL,
  passed_hidden INTEGER NOT NULL,
  score_awarded INTEGER NOT NULL,
  bonus_awarded INTEGER NOT NULL,
  compile_output TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id)
    REFERENCES participant_sessions(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(session_id)
    REFERENCES participant_sessions(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  participant_id INTEGER,
  type TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
`);

const now = () => new Date().toISOString();
const tx = db.transaction((fn) => fn());

/*
|--------------------------------------------------------------------------
| SCHEMA MIGRATION (older database files did not have participant_id /
| password_hash columns on the participants table)
|--------------------------------------------------------------------------
*/
const participantColumns = db.prepare("PRAGMA table_info(participants)").all().map((c) => c.name);
if (!participantColumns.includes("participant_id")) {
  db.exec("ALTER TABLE participants ADD COLUMN participant_id TEXT");
}
if (!participantColumns.includes("password_hash")) {
  db.exec("ALTER TABLE participants ADD COLUMN password_hash TEXT");
}
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_participants_participant_id ON participants(participant_id)");

/*
|--------------------------------------------------------------------------
| FRESH START ON EVERY SYSTEM/SERVER RESTART
|--------------------------------------------------------------------------
| Every time this process boots, all participant-related data is wiped
| so that no old participant, session, warning, score or progress can
| carry over. Each restart is a completely clean slate and every
| participant must log in as new. Admin accounts and the seeded
| question bank are preserved.
*/
tx(() => {
  db.prepare("DELETE FROM participant_progress").run();
  db.prepare("DELETE FROM submissions").run();
  db.prepare("DELETE FROM warnings").run();
  db.prepare("DELETE FROM activity_logs").run();
  db.prepare("DELETE FROM participant_sessions").run();
  db.prepare("DELETE FROM participants").run();

  if (db.prepare("SELECT id FROM event WHERE id = 1").get()) {
    db.prepare(`
      UPDATE event
      SET
        status = 'NOT_STARTED',
        start_time = NULL,
        pause_time = NULL,
        total_paused_ms = 0,
        end_time = NULL,
        updated_at = ?
      WHERE id = 1
    `).run(now());
  }
});

/*
|--------------------------------------------------------------------------
| EVENT SEED
|--------------------------------------------------------------------------
*/
if (!db.prepare("SELECT id FROM event WHERE id = 1").get()) {
  db.prepare(`
    INSERT INTO event (
      id,
      status,
      duration_seconds,
      total_paused_ms,
      updated_at
    )
    VALUES (1, ?, ?, ?, ?)
  `).run(
    "NOT_STARTED",
    DURATION,
    0,
    now()
  );
}

/*
|--------------------------------------------------------------------------
| QUESTION SEED
|--------------------------------------------------------------------------
*/
for (const [i, q] of QUESTIONS.entries()) {
  db.prepare(`
    INSERT INTO questions (
      id,
      language,
      title,
      description,
      input_format,
      starter_code,
      max_marks,
      position
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      input_format = excluded.input_format,
      starter_code = excluded.starter_code,
      max_marks = excluded.max_marks,
      position = excluded.position
  `).run(
    q.id,
    q.language,
    q.title,
    q.description,
    q.inputFormat,
    q.starterCode,
    q.maxMarks,
    i + 1
  );
}

const activeIds = QUESTIONS.map((q) => q.id);
if (activeIds.length > 0) {
  db.prepare(
    `DELETE FROM questions WHERE id NOT IN (${activeIds.map(() => "?").join(",")})`
  ).run(...activeIds);
}

/*
|--------------------------------------------------------------------------
| ADMIN SEED
|--------------------------------------------------------------------------
*/
const adminUser = process.env.ADMIN_USERNAME || "admin";
const adminPass = process.env.ADMIN_PASSWORD || "TryCrackMe@2026";

if (!db.prepare("SELECT id FROM admins WHERE username = ?").get(adminUser)) {
  db.prepare(`
    INSERT INTO admins (
      username,
      password_hash,
      created_at
    )
    VALUES (?, ?, ?)
  `).run(adminUser, bcrypt.hashSync(adminPass, 12), now());
}

/*
|--------------------------------------------------------------------------
| PARTICIPANT CREDENTIAL SEED
|--------------------------------------------------------------------------
| Valid participant IDs come from PARTICIPANT_IDS in .env (comma-separated,
| e.g. "TC001,TC002,TC003"). If that is not set, IDs are generated using
| PARTICIPANT_ID_PREFIX + PARTICIPANT_COUNT (defaults: "TC" and 60 ids).
| All participant IDs share SAMPLE_PARTICIPANT_PASSWORD from .env.
| Only these pre-issued ID/password pairs are allowed to log in.
*/
const participantPassword = process.env.SAMPLE_PARTICIPANT_PASSWORD || "participant@123";
const participantIdPrefix = process.env.PARTICIPANT_ID_PREFIX || "TC";
const participantCount = Number(process.env.PARTICIPANT_COUNT || 60);

const configuredIds = String(process.env.PARTICIPANT_IDS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const participantIds =
  configuredIds.length > 0
    ? configuredIds
    : Array.from({ length: participantCount }, (_, i) =>
        `${participantIdPrefix}${String(i + 1).padStart(3, "0")}`
      );

const participantPasswordHash = bcrypt.hashSync(participantPassword, 12);

const insertParticipant = db.prepare(`
  INSERT INTO participants (participant_id, password_hash, created_at)
  VALUES (?, ?, ?)
  ON CONFLICT(participant_id) DO UPDATE SET
    password_hash = excluded.password_hash
`);

tx(() => {
  for (const pid of participantIds) {
    insertParticipant.run(pid, participantPasswordHash, now());
  }
});

/*
|--------------------------------------------------------------------------
| EXPRESS
|--------------------------------------------------------------------------
*/
const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(express.json({ limit: "200kb" }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/
function sign(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

function setAuth(res, user) {
  res.cookie("tcm_auth", sign(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function auth(req, res, next) {
  try {
    const token = req.cookies.tcm_auth;
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

function role(requiredRole) {
  return (req, res, next) => {
    if (req.user?.role === requiredRole) {
      return next();
    }
    return res.status(403).json({ error: "Forbidden" });
  };
}

/*
|--------------------------------------------------------------------------
| EVENT TIMER
|--------------------------------------------------------------------------
*/
function elapsed(event) {
  if (!event.start_time) return 0;
  const end =
    event.status === "RUNNING"
      ? Date.now()
      : event.status === "PAUSED"
        ? Date.parse(event.pause_time)
        : event.end_time
          ? Date.parse(event.end_time)
          : Date.now();

  return Math.max(
    0,
    Math.floor((end - Date.parse(event.start_time) - event.total_paused_ms) / 1000)
  );
}

function remaining(event) {
  return Math.max(0, (event.duration_seconds || DURATION) - elapsed(event));
}

function getEvent() {
  let event = db.prepare("SELECT * FROM event WHERE id = 1").get();

  if (event.status === "RUNNING" && event.start_time) {
    const seconds = elapsed(event);
    if (seconds >= event.duration_seconds) {
      finishEvent();
      event = db.prepare("SELECT * FROM event WHERE id = 1").get();
    }
  }

  return {
    ...event,
    remainingSeconds: remaining(event),
    serverNow: Date.now(),
  };
}

function finishEvent() {
  const timestamp = now();
  tx(() => {
    const event = db.prepare("SELECT * FROM event WHERE id = 1").get();
    if (event.status === "ENDED") return;

    db.prepare(`
      UPDATE event
      SET
        status = 'ENDED',
        end_time = ?,
        pause_time = NULL,
        updated_at = ?
      WHERE id = 1
    `).run(timestamp, timestamp);

    db.prepare(`
      UPDATE participant_sessions
      SET
        status = CASE
          WHEN status = 'TERMINATED'
          THEN status
          ELSE 'COMPLETED'
        END,
        end_time = ?,
        last_activity = ?
      WHERE event_id = 1
      AND status IN ('ACTIVE', 'PAUSED')
    `).run(timestamp, timestamp);
  });

  io.emit("event:update", getEvent());
  io.emit("leaderboard:update", leaderboard());
}

/*
|--------------------------------------------------------------------------
| PARTICIPANT SESSION
|--------------------------------------------------------------------------
*/
function sessionFor(user) {
  return db
    .prepare(`
      SELECT *
      FROM participant_sessions
      WHERE participant_id = ?
      AND event_id = 1
    `)
    .get(user.sub);
}

function ensureSession(user) {
  let session = sessionFor(user);
  if (!session) {
    const timestamp = now();
    const result = db
      .prepare(`
        INSERT INTO participant_sessions (
          participant_id,
          event_id,
          status,
          start_time,
          last_activity
        )
        VALUES (?, 1, 'ACTIVE', ?, ?)
      `)
      .run(user.sub, timestamp, timestamp);

    session = db
      .prepare(`
        SELECT *
        FROM participant_sessions
        WHERE id = ?
      `)
      .get(result.lastInsertRowid);
  }
  return session;
}

function logActivity(session, userId, type, metadata = {}) {
  db.prepare(`
    INSERT INTO activity_logs (
      session_id,
      participant_id,
      type,
      metadata,
      created_at
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    session?.id || null,
    userId,
    type,
    JSON.stringify(metadata),
    now()
  );
}

/*
|--------------------------------------------------------------------------
| LEADERBOARD
|--------------------------------------------------------------------------
*/
function leaderboard() {
  const rows = db
    .prepare(`
      SELECT
        p.name,
        p.college,
        s.status,
        s.start_time,
        s.end_time,
        s.warnings_count,
        s.last_score_at,
        s.id AS session_id,
        p.id AS participant_id,

        COALESCE(SUM(pp.score), 0) AS c0,
        COALESCE(SUM(pp.bonus), 0) AS bonus,

        COALESCE(
          SUM(
            CASE
              WHEN q.language = 'C'
              THEN pp.score
              ELSE 0
            END
          ),
          0
        ) AS c_score,

        COALESCE(
          SUM(
            CASE
              WHEN q.language = 'Python'
              THEN pp.score
              ELSE 0
            END
          ),
          0
        ) AS python_score,

        COALESCE(
          SUM(
            CASE
              WHEN q.language = 'Java'
              THEN pp.score
              ELSE 0
            END
          ),
          0
        ) AS java_score,

        COALESCE(SUM(pp.solved), 0) AS solved

      FROM participants p

      LEFT JOIN participant_sessions s
        ON s.participant_id = p.id
        AND s.event_id = 1

      LEFT JOIN participant_progress pp
        ON pp.session_id = s.id

      LEFT JOIN questions q
        ON q.id = pp.question_id

      GROUP BY p.id

      ORDER BY
        (c0 + bonus) DESC,
        CASE
          WHEN s.last_score_at IS NULL
          THEN 999999999
          ELSE
            (
              julianday(s.last_score_at) -
              julianday((SELECT start_time FROM event WHERE id = 1))
            ) * 86400
        END ASC,
        p.name ASC
    `)
    .all();

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
    total_score: row.c0 + row.bonus,
    timeSeconds: row.last_score_at
      ? Math.max(
          0,
          Math.floor(
            (
              Date.parse(row.last_score_at) -
              Date.parse(
                db.prepare("SELECT start_time FROM event WHERE id = 1").get()
                  ?.start_time || row.last_score_at
              ) -
              (
                db.prepare("SELECT total_paused_ms FROM event WHERE id = 1").get()
                  ?.total_paused_ms || 0
              )
            ) / 1000
          )
        )
      : null,
  }));
}

/*
|--------------------------------------------------------------------------
| PROCESS EXECUTION
|--------------------------------------------------------------------------
*/
async function runProcess(command, args, input, timeout = 3000, maxOutput = 16000, cwd) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        PATH: process.env.PATH || "/usr/bin:/bin",
        LANG: "C",
        LC_ALL: "C",
        HOME: cwd,
      },
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const append = (current, value) => {
      if (current.length + value.length > maxOutput) {
        killed = true;
        try {
          if (process.platform === "win32") {
            child.kill("SIGKILL");
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        } catch {}
        return (
          current +
          value.slice(0, Math.max(0, maxOutput - current.length))
        );
      }
      return current + value;
    };

    child.stdout.on("data", (data) => {
      stdout = append(stdout, data.toString());
    });

    child.stderr.on("data", (data) => {
      stderr = append(stderr, data.toString());
    });

    child.on("error", (error) => {
      finish({
        ok: false,
        error: error.message,
        stdout,
        stderr: stderr ? `${stderr}\n${error.message}` : error.message,
        timeout: false,
      });
    });

    child.on("close", (code, signal) => {
      finish({
        ok: !killed && code === 0,
        code,
        signal,
        stdout,
        stderr,
        timeout: killed,
      });
    });

    child.stdin.end(input || "");

    setTimeout(() => {
      if (!settled) {
        killed = true;
        try {
          if (process.platform === "win32") {
            child.kill("SIGKILL");
          } else {
            process.kill(-child.pid, "SIGKILL");
          }
        } catch {}
      }
    }, timeout);
  });
}

const norm = (value) =>
  String(value ?? "")
    .replace(/\r/g, "")
    .trim()
    .split(/\s+/)
    .join(" ");

/*
|--------------------------------------------------------------------------
| CODE EXECUTION
|--------------------------------------------------------------------------
*/
async function execute(language, code, tests) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tcm-"));

  try {
    if (language === "C") {
      const source = path.join(directory, "main.c");
      const executable = path.join(
        directory,
        process.platform === "win32" ? "main.exe" : "main"
      );

      fs.writeFileSync(source, code);

      const compile = await runProcess(
        "gcc",
        [source, "-std=c11", "-O0", "-o", executable],
        "",
        5000,
        16000,
        directory
      );

      if (!compile.ok) {
        return { compile, tests: [] };
      }

      const results = [];
      for (const test of tests) {
        const result = await runProcess(
          executable,
          [],
          test[0],
          2500,
          16000,
          directory
        );

        results.push({
          ...result,
          expected: test[1],
          passed: result.ok && norm(result.stdout) === norm(test[1]),
        });

        if (result.timeout) break;
      }

      return { compile, tests: results };
    }

    if (language === "Python") {
      const source = path.join(directory, "main.py");
      fs.writeFileSync(source, code);

      const results = [];
      const pyCmd = process.platform === "win32" ? "python" : "python3";

      for (const test of tests) {
        const result = await runProcess(
          pyCmd,
          [source],
          test[0],
          2500,
          16000,
          directory
        );

        results.push({
          ...result,
          expected: test[1],
          passed: result.ok && norm(result.stdout) === norm(test[1]),
        });

        if (result.timeout) break;
      }

      return {
        compile: { ok: true, stdout: "", stderr: "" },
        tests: results,
      };
    }

    if (language === "Java") {
      const source = path.join(directory, "Main.java");
      fs.writeFileSync(source, code);

      const compile = await runProcess(
        "javac",
        [source],
        "",
        7000,
        16000,
        directory
      );

      if (!compile.ok) {
        return { compile, tests: [] };
      }

      const results = [];
      for (const test of tests) {
        const result = await runProcess(
          "java",
          ["-cp", directory, "Main"],
          test[0],
          3000,
          16000,
          directory
        );

        results.push({
          ...result,
          expected: test[1],
          passed: result.ok && norm(result.stdout) === norm(test[1]),
        });

        if (result.timeout) break;
      }

      return { compile, tests: results };
    }

    throw new Error("Unsupported language");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function publicQuestion(question) {
  return {
    id: question.id,
    language: question.language,
    title: question.title,
    description: question.description,
    inputFormat: question.inputFormat,
    starterCode: question.starterCode,
    maxMarks: question.maxMarks,
    publicTests: question.publicTests,
  };
}

function currentAllowed(req, res) {
  const event = getEvent();
  const session = sessionFor(req.user);

  if (event.status !== "RUNNING") {
    res.status(423).json({
      error: `Event is ${event.status}`,
      event,
    });
    return null;
  }

  if (
    !session ||
    session.status === "TERMINATED" ||
    session.status === "COMPLETED"
  ) {
    res.status(403).json({
      error: "Competition session is not active",
    });
    return null;
  }

  return { event, session };
}

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "TRY CRACK ME API" });
});

/*
| PARTICIPANT ENTRY (Passwordless - Stores Name & College in DB)
*/
app.post("/api/auth/participant/login", async (req, res) => {
  const { participantId, password, name, college } = req.body || {};
  const cleanId = String(participantId || "").trim();
  const cleanName = String(name || "").trim();
  const cleanCollege = String(college || "").trim();
  const cleanPassword = String(password || "");

  if (!cleanId || !cleanPassword || !cleanName || !cleanCollege) {
    return res.status(400).json({
      error: "Participant ID, Password, Name and College are all required.",
    });
  }

  const participant = db
    .prepare("SELECT * FROM participants WHERE UPPER(participant_id) = UPPER(?)")
    .get(cleanId);

  if (
    !participant ||
    !participant.password_hash ||
    !bcrypt.compareSync(cleanPassword, participant.password_hash)
  ) {
    return res.status(401).json({ error: "Invalid participant ID or password." });
  }

  db.prepare(`
    UPDATE participants
    SET name = ?, college = ?
    WHERE id = ?
  `).run(cleanName, cleanCollege, participant.id);

  setAuth(res, {
    id: participant.id,
    role: "participant",
  });

  res.json({
    user: {
      role: "participant",
      id: participant.id,
      participantId: participant.participant_id,
      name: cleanName,
      college: cleanCollege,
    },
    event: getEvent(),
  });
});

/*
| ADMIN LOGIN
*/
app.post("/api/auth/admin/login", async (req, res) => {
  const { username, password } = req.body || {};

  const admin = db
    .prepare("SELECT * FROM admins WHERE username = ?")
    .get(String(username || "").trim());

  if (!admin || !bcrypt.compareSync(String(password || ""), admin.password_hash)) {
    return res.status(401).json({ error: "Invalid admin credentials" });
  }

  setAuth(res, {
    id: admin.id,
    role: "admin",
  });

  res.json({
    user: {
      role: "admin",
      username: admin.username,
    },
    event: getEvent(),
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("tcm_auth");
  res.json({ ok: true });
});

app.get("/api/auth/me", auth, (req, res) => {
  if (req.user.role === "admin") {
    const admin = db
      .prepare("SELECT username FROM admins WHERE id = ?")
      .get(req.user.sub);

    return res.json({
      user: {
        role: "admin",
        username: admin?.username,
      },
      event: getEvent(),
    });
  }

  const participant = db
    .prepare("SELECT id, participant_id, name, college FROM participants WHERE id = ?")
    .get(req.user.sub);

  res.json({
    user: {
      role: "participant",
      id: participant?.id,
      participantId: participant?.participant_id,
      name: participant?.name,
      college: participant?.college,
    },
    event: getEvent(),
    session: sessionFor(req.user),
  });
});

app.get("/api/event", (req, res) => res.json(getEvent()));

app.get("/api/questions", auth, role("participant"), (req, res) => {
  res.json({ questions: QUESTIONS.map(publicQuestion) });
});

app.get("/api/participant/session", auth, role("participant"), (req, res) => {
  const session = sessionFor(req.user);
  const event = getEvent();

  if (!session) {
    return res.json({ session: null, event });
  }

  const progress = db
    .prepare(`
      SELECT question_id, code, solved, score, bonus, updated_at
      FROM participant_progress
      WHERE session_id = ?
    `)
    .all(session.id);

  res.json({ session, progress, event });
});

app.post("/api/participant/enter", auth, role("participant"), (req, res) => {
  const event = getEvent();

  if (event.status !== "RUNNING") {
    return res.status(423).json({ error: `EVENT ${event.status}` });
  }

  let session = sessionFor(req.user);

  if (session?.status === "TERMINATED") {
    return res.status(403).json({
      error: "Warning limit reached. You cannot re-enter this event.",
    });
  }

  if (session?.status === "COMPLETED") {
    return res.status(403).json({
      error: "This competition session is already completed.",
    });
  }

  session = ensureSession(req.user);

  db.prepare(`
    UPDATE participant_sessions
    SET status = 'ACTIVE', last_activity = ?
    WHERE id = ?
  `).run(now(), session.id);

  logActivity(session, req.user.sub, "SESSION_ENTER");

  res.json({
    session: db.prepare("SELECT * FROM participant_sessions WHERE id = ?").get(session.id),
    event: getEvent(),
  });
});

app.put("/api/participant/progress/:qid", auth, role("participant"), (req, res) => {
  const allowed = currentAllowed(req, res);
  if (!allowed) return;

  const question = QUESTION_MAP.get(req.params.qid);
  if (!question) {
    return res.status(404).json({ error: "Question not found" });
  }

  const code = String(req.body?.code ?? "");
  if (code.length > 100000) {
    return res.status(413).json({ error: "Code too large" });
  }

  db.prepare(`
    INSERT INTO participant_progress (session_id, question_id, code, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(session_id, question_id) DO UPDATE SET
      code = excluded.code,
      updated_at = excluded.updated_at
  `).run(allowed.session.id, question.id, code, now());

  db.prepare(`
    UPDATE participant_sessions
    SET current_question = ?, last_activity = ?
    WHERE id = ?
  `).run(question.id, now(), allowed.session.id);

  res.json({ ok: true });
});

app.post("/api/participant/run", auth, role("participant"), async (req, res) => {
  const allowed = currentAllowed(req, res);
  if (!allowed) return;

  const question = QUESTION_MAP.get(req.body?.questionId);
  if (!question) {
    return res.status(400).json({ error: "Invalid question" });
  }

  const code = String(req.body?.code ?? "");
  const result = await execute(question.language, code, question.publicTests);

  res.json({
    result: {
      compile: {
        ok: result.compile.ok,
        stdout: result.compile.stdout || "",
        stderr: result.compile.stderr || "",
      },
      tests: result.tests.map((test) => ({
        passed: test.passed,
        stdout: test.stdout || "",
        stderr: test.stderr || "",
        expected: test.expected,
        timeout: test.timeout,
      })),
    },
  });
});

app.post("/api/participant/submit", auth, role("participant"), async (req, res) => {
  const allowed = currentAllowed(req, res);
  if (!allowed) return;

  const question = QUESTION_MAP.get(req.body?.questionId);
  if (!question) {
    return res.status(400).json({ error: "Invalid question" });
  }

  const code = String(req.body?.code ?? "");
  const session = allowed.session;

  const result = await execute(question.language, code, question.publicTests);

  const publicPassed =
    !!result.compile.ok &&
    result.tests.length === question.publicTests.length &&
    result.tests.every((test) => test.passed);

  let hiddenPassed = false;
  if (publicPassed && question.hiddenTests?.length) {
    const hidden = await execute(question.language, code, question.hiddenTests);
    hiddenPassed =
      !!hidden.compile.ok &&
      hidden.tests.length === question.hiddenTests.length &&
      hidden.tests.every((test) => test.passed);
  } else if (publicPassed) {
    hiddenPassed = true;
  }

  const previous = db
    .prepare("SELECT * FROM participant_progress WHERE session_id = ? AND question_id = ?")
    .get(session.id, question.id);

  let award = 0;
  let bonus = 0;

  if (publicPassed && !previous?.solved) {
    award = question.maxMarks;
    if (question.language === "Python" && hiddenPassed) {
      bonus = 1;
    }

    db.prepare(`
      INSERT INTO participant_progress (session_id, question_id, code, solved, score, bonus, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, question_id) DO UPDATE SET
        code = excluded.code,
        solved = 1,
        score = excluded.score,
        bonus = excluded.bonus,
        updated_at = excluded.updated_at
    `).run(session.id, question.id, code, 1, award, bonus, now());

    db.prepare(`
      UPDATE participant_sessions
      SET last_score_at = ?, last_activity = ?
      WHERE id = ?
    `).run(now(), now(), session.id);
  } else {
    db.prepare(`
      INSERT INTO participant_progress (session_id, question_id, code, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(session_id, question_id) DO UPDATE SET
        code = excluded.code,
        updated_at = excluded.updated_at
    `).run(session.id, question.id, code, now());

    db.prepare(`
      UPDATE participant_sessions
      SET last_activity = ?
      WHERE id = ?
    `).run(now(), session.id);
  }

  db.prepare(`
    INSERT INTO submissions (
      session_id, question_id, language, code,
      passed_public, passed_hidden, score_awarded, bonus_awarded,
      compile_output, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    session.id,
    question.id,
    question.language,
    code,
    publicPassed ? 1 : 0,
    hiddenPassed ? 1 : 0,
    award,
    bonus,
    JSON.stringify({
      stdout: result.compile.stdout,
      stderr: result.compile.stderr,
    }),
    now()
  );

  logActivity(session, req.user.sub, "SUBMISSION", {
    questionId: question.id,
    publicPassed,
    hiddenPassed,
    award,
    bonus,
  });

  io.emit("leaderboard:update", leaderboard());

  res.json({
    publicPassed,
    hiddenPassed,
    scoreAwarded: award,
    bonusAwarded: bonus,
    alreadySolved: !!previous?.solved,
    result: {
      compile: {
        ok: result.compile.ok,
        stdout: result.compile.stdout || "",
        stderr: result.compile.stderr || "",
      },
      tests: result.tests.map((test) => ({
        passed: test.passed,
        stdout: test.stdout || "",
        stderr: test.stderr || "",
        expected: test.expected,
        timeout: test.timeout,
      })),
    },
    leaderboard: leaderboard(),
  });
});

app.post("/api/participant/activity", auth, role("participant"), (req, res) => {
  const session = sessionFor(req.user);
  if (!session || session.status !== "ACTIVE") {
    return res.status(403).json({ error: "Session not active" });
  }

  const type = String(req.body?.type || "UNKNOWN").slice(0, 80);
  const reason = String(req.body?.reason || type).slice(0, 200);
  const timestamp = now();

  const result = tx(() => {
    db.prepare(`
      INSERT INTO warnings (session_id, type, reason, metadata, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.id, type, reason, JSON.stringify(req.body?.metadata || {}), timestamp);

    const count = db
      .prepare("SELECT COUNT(*) AS c FROM warnings WHERE session_id = ?")
      .get(session.id).c;

    let terminated = false;

    if (count >= 10) {
      db.prepare(`
        UPDATE participant_sessions
        SET warnings_count = ?, status = 'TERMINATED', end_time = ?, last_activity = ?
        WHERE id = ?
      `).run(count, timestamp, timestamp, session.id);
      terminated = true;
    } else {
      db.prepare(`
        UPDATE participant_sessions
        SET warnings_count = ?, last_activity = ?
        WHERE id = ?
      `).run(count, timestamp, session.id);
    }

    logActivity(session, req.user.sub, "WARNING", { type, reason, count });
    return { count, terminated };
  });

  io.emit("leaderboard:update", leaderboard());

  if (result.terminated) {
    io.to(`participant:${req.user.sub}`).emit("session:terminated", {
      reason: "Warning limit exceeded",
      count: result.count,
    });
  }

  res.json(result);
});

app.get("/api/participant/result", auth, role("participant"), (req, res) => {
  const session = sessionFor(req.user);
  const event = getEvent();

  const rows = session
    ? db
        .prepare(`
          SELECT pp.question_id, pp.solved, pp.score, pp.bonus, q.language, q.title
          FROM participant_progress pp
          JOIN questions q ON q.id = pp.question_id
          WHERE pp.session_id = ?
          ORDER BY q.position
        `)
        .all(session.id)
    : [];

  const totals = rows.reduce(
    (acc, row) => {
      acc.base += row.score;
      acc.bonus += row.bonus;
      return acc;
    },
    { base: 0, bonus: 0 }
  );

  res.json({
    event,
    session,
    rows,
    totals: { ...totals, total: totals.base + totals.bonus },
  });
});

/*
| ADMIN EVENT CONTROLS
*/
function adminEventChange(action) {
  return (req, res) => {
    let event = db.prepare("SELECT * FROM event WHERE id = 1").get();
    const timestamp = now();

    if (action === "start" && event.status === "NOT_STARTED") {
      db.prepare(`
        UPDATE event
        SET
          status = 'RUNNING',
          start_time = ?,
          pause_time = NULL,
          total_paused_ms = 0,
          end_time = NULL,
          updated_at = ?
        WHERE id = 1
      `).run(timestamp, timestamp);
    } else if (action === "pause" && event.status === "RUNNING") {
      db.prepare(`
        UPDATE event
        SET
          status = 'PAUSED',
          pause_time = ?,
          updated_at = ?
        WHERE id = 1
      `).run(timestamp, timestamp);

      db.prepare(`
        UPDATE participant_sessions
        SET status = 'PAUSED', last_activity = ?
        WHERE event_id = 1 AND status = 'ACTIVE'
      `).run(timestamp);
    } else if (action === "resume" && event.status === "PAUSED") {
      const addedPause = Date.now() - Date.parse(event.pause_time);

      db.prepare(`
        UPDATE event
        SET
          status = 'RUNNING',
          pause_time = NULL,
          total_paused_ms = total_paused_ms + ?,
          updated_at = ?
        WHERE id = 1
      `).run(addedPause, timestamp);

      db.prepare(`
        UPDATE participant_sessions
        SET status = 'ACTIVE', last_activity = ?
        WHERE event_id = 1 AND status = 'PAUSED'
      `).run(timestamp);
    } else if (action === "end" && (event.status === "RUNNING" || event.status === "PAUSED")) {
      finishEvent();
      return res.json(getEvent());
    } else if (action === "reset") {
      tx(() => {
        db.prepare("DELETE FROM participant_progress").run();
        db.prepare("DELETE FROM submissions").run();
        db.prepare("DELETE FROM warnings").run();
        db.prepare("DELETE FROM activity_logs").run();
        db.prepare("DELETE FROM participant_sessions").run();
        db.prepare(`
          UPDATE event
          SET
            status = 'NOT_STARTED',
            start_time = NULL,
            pause_time = NULL,
            total_paused_ms = 0,
            end_time = NULL,
            updated_at = ?
          WHERE id = 1
        `).run(timestamp);
      });
    } else {
      return res.status(409).json({ error: `Cannot ${action} while event is ${event.status}` });
    }

    const output = getEvent();
    io.emit("event:update", output);
    io.emit("leaderboard:update", leaderboard());
    res.json(output);
  };
}

for (const action of ["start", "pause", "resume", "end", "reset"]) {
  app.post(`/api/admin/event/${action}`, auth, role("admin"), adminEventChange(action));
}

app.get("/api/admin/leaderboard", auth, role("admin"), (req, res) => {
  res.json({
    leaderboard: leaderboard(),
    event: getEvent(),
  });
});

app.get("/api/admin/participants", auth, role("admin"), (req, res) => {
  const rows = db
    .prepare(`
      SELECT
        p.id AS participant_id,
        p.participant_id AS participant_code,
        p.name,
        p.college,
        s.status,
        s.start_time,
        s.end_time,
        s.current_question,
        s.warnings_count,
        s.last_score_at,
        s.id AS session_id,
        COALESCE(
          (
            SELECT SUM(score + bonus)
            FROM participant_progress
            WHERE session_id = s.id
          ),
          0
        ) AS score,
        COALESCE(
          (
            SELECT COUNT(*)
            FROM participant_progress
            WHERE session_id = s.id AND solved = 1
          ),
          0
        ) AS solved
      FROM participants p
      LEFT JOIN participant_sessions s
        ON s.participant_id = p.id AND s.event_id = 1
      ORDER BY p.name
    `)
    .all();

  res.json({ participants: rows });
});

app.get("/api/admin/participants/:pid", auth, role("admin"), (req, res) => {
  const participant = db
    .prepare("SELECT id, participant_id, name, college, created_at FROM participants WHERE id = ?")
    .get(req.params.pid);

  if (!participant) {
    return res.status(404).json({ error: "Participant not found" });
  }

  const session = db
    .prepare("SELECT * FROM participant_sessions WHERE participant_id = ? AND event_id = 1")
    .get(participant.id);

  const warnings = session
    ? db
        .prepare("SELECT * FROM warnings WHERE session_id = ? ORDER BY id DESC")
        .all(session.id)
    : [];

  const submissions = session
    ? db
        .prepare(`
          SELECT id, question_id, language, passed_public, passed_hidden, score_awarded, bonus_awarded, compile_output, created_at
          FROM submissions
          WHERE session_id = ?
          ORDER BY id DESC
        `)
        .all(session.id)
    : [];

  const activity = session
    ? db
        .prepare("SELECT type, metadata, created_at FROM activity_logs WHERE session_id = ? ORDER BY id DESC LIMIT 100")
        .all(session.id)
    : [];

  res.json({ participant, session, warnings, submissions, activity });
});

app.get("/api/admin/submissions", auth, role("admin"), (req, res) => {
  const submissions = db
    .prepare(`
      SELECT sub.*, p.name, p.college
      FROM submissions sub
      JOIN participant_sessions s ON s.id = sub.session_id
      JOIN participants p ON p.id = s.participant_id
      WHERE s.event_id = 1
      ORDER BY sub.id DESC
      LIMIT 300
    `)
    .all();

  res.json({ submissions });
});

app.get("/api/admin/warnings", auth, role("admin"), (req, res) => {
  const warnings = db
    .prepare(`
      SELECT w.*, p.name, p.college
      FROM warnings w
      JOIN participant_sessions s ON s.id = w.session_id
      JOIN participants p ON p.id = s.participant_id
      WHERE s.event_id = 1
      ORDER BY w.id DESC
      LIMIT 300
    `)
    .all();

  res.json({ warnings });
});

/*
| SOCKET.IO
*/
io.use((socket, next) => {
  try {
    const rawCookie = socket.request.headers.cookie || "";
    const match = rawCookie.match(/(?:^|; )tcm_auth=([^;]+)/);
    if (!match) return next(new Error("unauthorized"));

    socket.user = jwt.verify(decodeURIComponent(match[1]), JWT_SECRET);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

io.on("connection", (socket) => {
  if (socket.user.role === "admin") {
    socket.join("admin");
  } else {
    socket.join(`participant:${socket.user.sub}`);
  }

  socket.emit("event:update", getEvent());
});

setInterval(() => {
  getEvent();
}, 1000);

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `\nCannot start TRY CRACK ME API: port ${PORT} is already in use.\n` +
        `This usually means another instance of the server (or another app) is still running.\n\n` +
        `Fix it with ONE of these:\n` +
        `  1) Stop whatever is already using port ${PORT}:\n` +
        `       Linux/macOS:  lsof -i :${PORT}   then   kill -9 <PID>\n` +
        `       Windows:      netstat -ano | findstr :${PORT}   then   taskkill /PID <PID> /F\n` +
        `  2) Or run this server on a different port by setting PORT in your .env file\n` +
        `     (e.g. PORT=5001) and updating CLIENT_URL/the client proxy to match.\n`
    );
    process.exit(1);
  }

  console.error("Failed to start TRY CRACK ME API:", err);
  process.exit(1);
});

httpServer.listen(PORT, () => {
  console.log(`TRY CRACK ME API running on http://localhost:${PORT}`);
});