const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { sbConfigured, sbInsert, sbList, sbGet, sbDelete } = require('./supabase');

// Supabase PostgREST tables (production persistence, snake_case columns).
const T_USERS = 'tailorfit_users';
const T_ANALYSES = 'tailorfit_analyses';

const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NOW_REGION;
const DB_DIR = isVercel ? '/tmp' : __dirname;
const DB_PATH = process.env.DATABASE_PATH || path.join(DB_DIR, 'resume_tailor.db');
let db = null;
let initPromise = null;

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('[DB] Save warning:', err.message);
  }
}

async function initDb() {
  if (sbConfigured()) {
    console.log('☁️ Supabase PostgREST storage active (tailorfit_users / tailorfit_analyses)');
    return null;
  }
  if (db) return db;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const SQL = await initSqlJs();

      if (fs.existsSync(DB_PATH)) {
        try {
          const fileBuffer = fs.readFileSync(DB_PATH);
          db = new SQL.Database(fileBuffer);
        } catch (readErr) {
          console.warn('[DB] Failed to load existing DB, initializing fresh:', readErr.message);
          db = new SQL.Database();
        }
      } else {
        db = new SQL.Database();
      }

      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS resume_analyses (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          original_resume TEXT NOT NULL,
          job_description TEXT NOT NULL,
          original_score INTEGER,
          optimized_score INTEGER,
          missing_keywords TEXT,
          optimized_resume TEXT,
          executive_summary TEXT,
          cover_letter TEXT,
          score_breakdown TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `);

      saveDb();
      return db;
    } catch (err) {
      console.error('[DB] Initialization error:', err.message);
      return null;
    }
  })();

  return initPromise;
}

// jsonb columns may come back as native objects (PostgREST) or JSON strings
// (legacy sql.js rows) — normalize on read for backward compatibility.
function parseMaybeJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (e) { return fallback; }
  }
  return value;
}

function getOne(sql, params = []) {
  if (!db) return null;
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let result = null;
    if (stmt.step()) {
      result = stmt.getAsObject();
    }
    stmt.free();
    return result;
  } catch (e) {
    console.error('[DB] getOne error:', e.message);
    return null;
  }
}

function getAll(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  } catch (e) {
    console.error('[DB] getAll error:', e.message);
    return [];
  }
}

module.exports = {
  initDb,

  async createUser(name, email, passwordHash) {
    if (sbConfigured()) {
      const id = uuidv4();
      const normalizedEmail = String(email).toLowerCase();
      const row = await sbInsert(T_USERS, { id, name, email: normalizedEmail, password_hash: passwordHash });
      return { id: (row && row.id) || id, name, email: normalizedEmail };
    }

    if (!db) return { id: uuidv4(), name, email: email.toLowerCase() };
    const id = uuidv4();
    try {
      db.run(
        'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)',
        [id, name, email.toLowerCase(), passwordHash]
      );
      saveDb();
    } catch (e) {}
    return { id, name, email: email.toLowerCase() };
  },

  async findUserByEmail(email) {
    if (sbConfigured()) {
      const rows = await sbList(T_USERS, { filter: { email: `eq.${String(email).toLowerCase()}` }, limit: 1 });
      return rows[0] || null;
    }
    return getOne('SELECT * FROM users WHERE email = ?', [email.toLowerCase()]);
  },

  async findUserById(id) {
    if (sbConfigured()) {
      const row = await sbGet(T_USERS, id);
      if (!row) return null;
      return { id: row.id, name: row.name, email: row.email, created_at: row.created_at };
    }
    return getOne('SELECT id, name, email, created_at FROM users WHERE id = ?', [id]);
  },

  async saveAnalysis(userId, originalResume, jobDesc, analysisData) {
    if (sbConfigured()) {
      const id = uuidv4();
      const row = await sbInsert(T_ANALYSES, {
        id,
        user_id: userId || null,
        original_resume: originalResume,
        job_description: jobDesc,
        original_score: analysisData.original_score || 0,
        optimized_score: analysisData.optimized_score || 0,
        missing_keywords: analysisData.missing_keywords || [],
        optimized_resume: analysisData.optimized_resume || '',
        executive_summary: analysisData.executive_summary || '',
        cover_letter: analysisData.cover_letter || '',
        score_breakdown: analysisData.score_breakdown || {}
      });
      return { id: (row && row.id) || id, ...analysisData };
    }

    const id = uuidv4();
    if (!db) return { id, ...analysisData };
    const missingKwStr = JSON.stringify(analysisData.missing_keywords || []);
    const scoreBreakdownStr = JSON.stringify(analysisData.score_breakdown || {});

    try {
      db.run(`
        INSERT INTO resume_analyses (id, user_id, original_resume, job_description, original_score, optimized_score, missing_keywords, optimized_resume, executive_summary, cover_letter, score_breakdown)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id,
        userId || null,
        originalResume,
        jobDesc,
        analysisData.original_score || 0,
        analysisData.optimized_score || 0,
        missingKwStr,
        analysisData.optimized_resume || '',
        analysisData.executive_summary || '',
        analysisData.cover_letter || '',
        scoreBreakdownStr
      ]);

      saveDb();
    } catch (e) {
      console.error('[DB] saveAnalysis error:', e.message);
    }
    return { id, ...analysisData };
  },

  async getUserHistory(userId) {
    if (sbConfigured()) {
      const opts = userId
        ? { filter: { user_id: `eq.${userId}` }, order: 'created_at.desc' }
        : { order: 'created_at.desc', limit: 20 };
      const rows = await sbList(T_ANALYSES, opts);
      return rows.map(r => ({
        ...r,
        missing_keywords: parseMaybeJson(r.missing_keywords, []),
        score_breakdown: parseMaybeJson(r.score_breakdown, {})
      }));
    }

    const sql = userId
      ? 'SELECT * FROM resume_analyses WHERE user_id = ? ORDER BY created_at DESC'
      : 'SELECT * FROM resume_analyses ORDER BY created_at DESC LIMIT 20';
    const rows = getAll(sql, userId ? [userId] : []);

    return rows.map(r => ({
      ...r,
      missing_keywords: r.missing_keywords ? JSON.parse(r.missing_keywords) : [],
      score_breakdown: r.score_breakdown ? JSON.parse(r.score_breakdown) : {}
    }));
  },

  async deleteAnalysis(id, userId) {
    if (sbConfigured()) {
      const row = await sbGet(T_ANALYSES, id);
      if (!row) return;
      if (userId && row.user_id && row.user_id !== userId) return;
      await sbDelete(T_ANALYSES, id);
      return;
    }

    if (!db) return;
    try {
      if (userId) {
        db.run('DELETE FROM resume_analyses WHERE id = ? AND user_id = ?', [id, userId]);
      } else {
        db.run('DELETE FROM resume_analyses WHERE id = ?', [id]);
      }
      saveDb();
    } catch (e) {}
  }
};
