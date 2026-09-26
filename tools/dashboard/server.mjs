import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const DASH_DIR = __dirname;
const LOGS_DIR = path.join(DASH_DIR, 'logs');

// --- Helper Functions ---

const runGit = (args) => new Promise((resolve) => {
  const child = spawn('git', args, { cwd: ROOT_DIR });
  let out = '';
  child.stdout.on('data', d => out += d);
  child.on('close', () => resolve(out.trim()));
  child.on('error', () => resolve(''));
});

const safeRead = (filePath) => {
  try { return fs.readFileSync(filePath, 'utf8'); } catch { return ''; }
};

const safeReadJson = (filePath) => {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
};

// --- State Aggregation ---

async function getState() {
  const state = {
    events: [],
    workers: [],
    lots: { todo: [], doing: [], done: [] },
    git: { log: [], worktrees: [], branch: '' },
    results: {}
  };

  // 1. Events (last 60)
  const eventsLines = safeRead(path.join(DASH_DIR, 'events.jsonl')).trim().split('\n').filter(Boolean);
  state.events = eventsLines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean).slice(-60).reverse(); // newest first

  // 2. Workers (from logs/gem-*.jsonl)
  if (fs.existsSync(LOGS_DIR)) {
    const files = fs.readdirSync(LOGS_DIR).filter(f => f.startsWith('gem-') && f.endsWith('.jsonl'));
    for (const file of files) {
      const lines = safeRead(path.join(LOGS_DIR, file)).trim().split('\n').filter(Boolean);
      const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (parsed.length > 0) {
        state.workers.push({
          id: file,
          model: 'Gemini',
          source: 'gemini',
          actions: parsed.slice(-3).reverse() // last 3
        });
      }
    }
  }

  // 3. Lots from plan/SUIVI.md
  const suivi = safeRead(path.join(ROOT_DIR, 'plan', 'SUIVI.md'));
  const tableLines = suivi.split('\n').filter(l => l.startsWith('|') && !l.includes('---|'));
  tableLines.slice(1).forEach(line => { // skip header
    const cols = line.split('|').map(c => c.trim());
    if (cols.length >= 8) {
      const lot = {
        id: cols[1], title: cols[2], cost: cols[3],
        owner: cols[4], deps: cols[5], status: cols[6],
        assignee: cols[7], notes: cols[8]
      };
      if (lot.status.includes('à prendre')) state.lots.todo.push(lot);
      else if (lot.status.includes('en cours')) state.lots.doing.push(lot);
      else if (lot.status.includes('fait')) state.lots.done.push(lot);
    }
  });

  // 4. Git
  const gitLog = await runGit(['log', '-30', '--pretty=format:%h|%an|%ar|%s']);
  state.git.log = gitLog.split('\n').filter(Boolean).map(l => {
    const [hash, author, time, msg] = l.split('|');
    return { hash, author, time, msg };
  });
  state.git.worktrees = (await runGit(['worktree', 'list'])).split('\n').filter(Boolean);
  state.git.branch = await runGit(['branch', '--show-current']);

  // 5. Results
  // Just find some recent captures (dummy logic for now, actually read dir)
  try {
    const captureDir = path.join(ROOT_DIR, 'reports'); // Assuming captures go to reports? Actually instruction says captures/**/*.png
  } catch(e) {}
  
  // Actually instruction says: captures/**/*.png, captures/anim/rapport.json, etc.
  const capturesDir = path.join(ROOT_DIR, 'captures');
  const findPngs = (dir, fileList = []) => {
    if(!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const stat = fs.statSync(path.join(dir, file));
      if (stat.isDirectory()) {
        findPngs(path.join(dir, file), fileList);
      } else if (file.endsWith('.png')) {
        fileList.push(path.join(dir, file).replace(ROOT_DIR, '').replace(/\\/g, '/'));
      }
    }
    return fileList;
  };
  state.results.captures = findPngs(capturesDir).slice(-5);
  
  state.results.anim = safeReadJson(path.join(capturesDir, 'anim', 'rapport.json'));
  state.results.balance = safeReadJson(path.join(capturesDir, 'balance', 'rapport.json'));
  
  // Reports
  const reportsDir = path.join(ROOT_DIR, 'reports');
  const rendusDir = path.join(ROOT_DIR, 'plan', 'rendus');
  state.results.reports = [];
  const readMds = (dir) => {
    if(!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
      const content = safeRead(path.join(dir, f)).split('\n').filter(Boolean);
      return { file: path.join(dir, f).replace(ROOT_DIR, '').replace(/\\/g, '/'), title: content[0] || f, lines: content.slice(1, 4) };
    });
  };
  state.results.reports.push(...readMds(reportsDir));
  state.results.reports.push(...readMds(rendusDir));

  // Voice/Presets
  state.results.presets = safeReadJson(path.join(ROOT_DIR, 'public', 'assets', 'presets', 'presets.json'));
  state.results.voices = safeReadJson(path.join(ROOT_DIR, 'public', 'assets', 'voices', 'manifest.json'));

  return state;
}


// --- HTTP Server ---
const PORT = 4545;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.md': 'text/markdown',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const server = http.createServer(async (req, res) => {
  console.log(`[REQ] ${req.method} ${req.url}`);

  if (req.url === '/') {
    const html = safeRead(path.join(DASH_DIR, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }
  
  if (req.url === '/style.css' || req.url === '/script.js') {
    const file = safeRead(path.join(DASH_DIR, req.url.substring(1)));
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(req.url)] });
    return res.end(file);
  }

  if (req.url === '/api/state') {
    const state = await getState();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(state));
  }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    const sendState = async () => {
      const state = await getState();
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    };

    sendState(); // Initial state

    // Poll Git every 5s
    const gitInterval = setInterval(sendState, 5000);

    // Watch files
    const watchers = [];
    const watchPaths = [
      path.join(DASH_DIR, 'events.jsonl'),
      path.join(ROOT_DIR, 'plan', 'SUIVI.md')
    ];
    if (fs.existsSync(LOGS_DIR)) {
      watchPaths.push(LOGS_DIR); // watch dir for worker logs
    }

    watchPaths.forEach(p => {
      if (fs.existsSync(p)) {
        const w = fs.watch(p, { recursive: true }, (eventType) => {
          sendState();
        });
        watchers.push(w);
      }
    });

    req.on('close', () => {
      clearInterval(gitInterval);
      watchers.forEach(w => w.close());
    });
    return;
  }

  if (req.url.startsWith('/files/')) {
    const relativePath = decodeURIComponent(req.url.substring(7));
    if (relativePath.includes('..') || relativePath.includes('.env')) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    const absolutePath = path.join(ROOT_DIR, relativePath);
    if (!absolutePath.startsWith(ROOT_DIR)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    
    if (fs.existsSync(absolutePath)) {
      const ext = path.extname(absolutePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(absolutePath).pipe(res);
      return;
    } else {
      res.writeHead(404);
      return res.end('Not found');
    }
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, 'localhost', () => {
  console.log(`Dashboard server running at http://localhost:${PORT}`);
});
