require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const { extractText } = require('./services/extractText');
const { analyzeCourse, llmConfigured } = require('./services/analyzeCourse');

const app = express();

// ---------- Config ----------
const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = 'main',
  UPLOAD_PATH = 'uploads',
  UPLOAD_KEY = '',
} = process.env;

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);
const PORT = process.env.PORT || 8080;

// Files are held in memory only, then pushed to GitHub. Nothing is written to
// Azure disk, so the site stays fast and stateless.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Helpers ----------
function ghConfigured() {
  return Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
}

// multer decodes multipart filenames as latin1, which garbles Thai (e.g. "à¸«à¸¥...").
// Re-decode as UTF-8; fall back to the original if the result is invalid.
function fixFileName(name) {
  if (!name) return name;
  // Already contains real Unicode (e.g. proper Thai) — leave untouched.
  if (/[Ā-￿]/.test(name)) return name;
  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  return fixed.includes('�') ? name : fixed;
}

// Make a safe, unique file name: <timestamp>-<sanitized-original>
function buildStoredName(originalName) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const clean = originalName
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_') // keep letters+marks (Thai vowels/tones), numbers, . _ -
    .replace(/_+/g, '_')
    .slice(0, 120);
  return `${stamp}-${clean || 'file'}`;
}

// Commit a file to GitHub via the Contents API.
async function commitToGitHub({ repoPath, contentBase64, message }) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURI(
    repoPath
  )}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'course-upload-webapp',
    },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: GITHUB_BRANCH,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data && data.message ? data.message : `HTTP ${res.status}`;
    throw new Error(`GitHub API error: ${detail}`);
  }
  return data;
}

// List files stored in the uploads folder of the repo.
async function listGitHubFiles() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURI(
    UPLOAD_PATH
  )}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'course-upload-webapp',
    },
  });

  if (res.status === 404) return []; // folder not created yet
  const data = await res.json().catch(() => ([]));
  if (!res.ok) {
    const detail = data && data.message ? data.message : `HTTP ${res.status}`;
    throw new Error(`GitHub API error: ${detail}`);
  }
  return (Array.isArray(data) ? data : [])
    .filter((it) => it.type === 'file')
    .map((it) => ({
      name: it.name,
      path: it.path,
      sizeBytes: it.size,
      htmlUrl: it.html_url,
      downloadUrl: it.download_url,
    }))
    .sort((a, b) => b.name.localeCompare(a.name)); // newest first (timestamp prefix)
}

// Fetch raw bytes of a file in the repo (used for on-demand analysis).
async function fetchGitHubFile(repoPath) {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURI(
    repoPath
  )}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'course-upload-webapp',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data && data.message ? data.message : `HTTP ${res.status}`;
    throw new Error(`GitHub API error: ${detail}`);
  }
  return Buffer.from(data.content || '', 'base64');
}

// ---------- Routes ----------
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    githubConfigured: ghConfigured(),
    repo: ghConfigured() ? `${GITHUB_OWNER}/${GITHUB_REPO}` : null,
    branch: GITHUB_BRANCH,
    uploadPath: UPLOAD_PATH,
    maxUploadMb: MAX_UPLOAD_MB,
    uploadKeyRequired: Boolean(UPLOAD_KEY),
    aiConfigured: llmConfigured(),
  });
});

// List uploaded files.
app.get('/api/files', async (req, res) => {
  if (!ghConfigured()) {
    return res.status(500).json({ ok: false, error: 'GitHub is not configured.' });
  }
  try {
    const files = await listGitHubFiles();
    res.json({ ok: true, files });
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

// Analyze a course document with AI. Accepts either an uploaded file (multipart
// field "file") OR a JSON body { repoPath } pointing at an already-stored file.
app.post('/api/analyze', (req, res) => {
  if (UPLOAD_KEY && req.headers['x-upload-key'] !== UPLOAD_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized (bad or missing upload key).' });
  }

  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE' ? `File too large. Max ${MAX_UPLOAD_MB} MB.` : err.message;
      return res.status(400).json({ ok: false, error: msg });
    }

    try {
      let buffer;
      let name;

      if (req.file) {
        buffer = req.file.buffer;
        name = fixFileName(req.file.originalname);
      } else if (req.body && req.body.repoPath) {
        if (!ghConfigured()) {
          return res.status(500).json({ ok: false, error: 'GitHub is not configured.' });
        }
        buffer = await fetchGitHubFile(req.body.repoPath);
        name = path.basename(req.body.repoPath);
      } else {
        return res
          .status(400)
          .json({ ok: false, error: 'Provide a file (field "file") or a repoPath.' });
      }

      const { text, kind } = await extractText(buffer, name);
      const analysis = await analyzeCourse(text, {
        courseName: req.body.courseName,
        courseCode: req.body.courseCode,
      });

      res.json({ ok: true, sourceName: name, extractedKind: kind, textChars: text.length, analysis });
    } catch (e) {
      const status = /not configured/i.test(e.message) ? 500 : 502;
      res.status(status).json({ ok: false, error: e.message });
    }
  });
});

app.post('/api/upload', (req, res) => {
  // Optional shared-secret gate.
  if (UPLOAD_KEY && req.headers['x-upload-key'] !== UPLOAD_KEY) {
    return res.status(401).json({ ok: false, error: 'Unauthorized (bad or missing upload key).' });
  }

  upload.single('file')(req, res, async (err) => {
    if (err) {
      const msg =
        err.code === 'LIMIT_FILE_SIZE'
          ? `File too large. Max ${MAX_UPLOAD_MB} MB.`
          : err.message;
      return res.status(400).json({ ok: false, error: msg });
    }

    if (!ghConfigured()) {
      return res.status(500).json({
        ok: false,
        error: 'GitHub is not configured. Set GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO.',
      });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file received (field name must be "file").' });
    }

    try {
      const originalName = fixFileName(req.file.originalname);
      const storedName = buildStoredName(originalName);
      const repoPath = `${UPLOAD_PATH}/${storedName}`.replace(/\/+/g, '/');
      const courseName = (req.body.courseName || '').trim();
      const courseCode = (req.body.courseCode || '').trim();

      const commitMessage =
        `Upload course file: ${originalName}` +
        (courseName ? ` | ${courseName}` : '') +
        (courseCode ? ` (${courseCode})` : '');

      const result = await commitToGitHub({
        repoPath,
        contentBase64: req.file.buffer.toString('base64'),
        message: commitMessage,
      });

      return res.json({
        ok: true,
        fileName: storedName,
        originalName,
        sizeBytes: req.file.size,
        repoPath,
        htmlUrl: result.content && result.content.html_url,
        downloadUrl: result.content && result.content.download_url,
        commitSha: result.commit && result.commit.sha,
      });
    } catch (e) {
      return res.status(502).json({ ok: false, error: e.message });
    }
  });
});

app.listen(PORT, () => {
  console.log(`course-upload-webapp listening on port ${PORT}`);
  console.log(`GitHub configured: ${ghConfigured()}`);
});
