import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../');
const DASH_DIR = path.join(ROOT_DIR, 'dashboard'); // journal écrit par tools/dashboard/log.mjs
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
    claude: [],
    gradium: [],
    lots: { todo: [], doing: [], done: [] },
    git: { log: [], worktrees: [], branch: '' },
    results: {}
  };

  // 1. Events (all)
  const eventsLines = safeRead(path.join(DASH_DIR, 'events.jsonl')).trim().split('\n').filter(Boolean);
  const allEvents = eventsLines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
  
  state.events = [...allEvents].slice(-60).reverse(); // newest first for generic feed if needed

  const lotStatus = {};
  allEvents.forEach(e => {
    if (e.lot) {
      if (!lotStatus[e.lot] || new Date(e.t) > new Date(lotStatus[e.lot].t)) {
        lotStatus[e.lot] = e;
      }
    }
  });

  const formatGeminiAction = (a) => {
    const toolName = a.name || a.tool || (a.type === 'tool_use' ? a.name : null) || a.action || a.type || '';
    const name = toolName.replace('default_api:', '');
    const params = a.params || a.args || a;

    if (name === 'read_file') return `lit <code>${params.file_path}</code>`;
    if (name === 'write_file' || name === 'replace') return `modifie <code>${params.file_path}</code>`;
    if (name === 'run_shell_command') return `lance <code>${(params.command || '').substring(0, 30)}</code>...`;
    if (name === 'update_topic') return params.summary || params.title || 'Mise à jour du sujet';
    if (name === 'result') return `terminé : ${a.tool_calls || 0} appels, ${a.tokens || 0} k jetons, ${a.duration_ms ? Math.round(a.duration_ms / 60000) : 0} min`;
    
    if (a.type === 'result') return `terminé : ${a.tool_calls || 0} appels, ${a.tokens || 0} k jetons, ${a.duration_ms ? Math.round(a.duration_ms / 60000) : 0} min`;
    
    if (name) return `outil : ${name}`;
    return JSON.stringify(a).substring(0, 50);
  };

  // 2. Workers (from logs/gem-*.jsonl)
  if (fs.existsSync(LOGS_DIR)) {
    const files = fs.readdirSync(LOGS_DIR).filter(f => f.startsWith('gem-') && f.endsWith('.jsonl'));
    for (const file of files) {
      const lotIdMatch = file.match(/gem-(.+)\.jsonl/);
      const lotId = lotIdMatch ? lotIdMatch[1] : file;
      const lotEvent = lotStatus[lotId] || {};

      const lines = safeRead(path.join(LOGS_DIR, file)).trim().split('\n').filter(Boolean);
      const parsed = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (parsed.length > 0) {
        const startEvent = allEvents.find(e => e.lot === lotId && e.status === 'en-cours');
        const startTime = startEvent ? new Date(startEvent.t) : new Date();
        const diffMs = Date.now() - startTime;
        const diffMin = Math.floor(diffMs / 60000);
        const durationStr = lotEvent.status === 'fait' ? 'Terminé' : `${diffMin} min`;

        state.workers.push({
          id: lotId,
          title: lotEvent.title || `Lot ${lotId}`,
          status: lotEvent.status || 'en-cours',
          duration: durationStr,
          actions: parsed.slice(-3).reverse().map(formatGeminiAction)
        });
      }
    }
  }

  // 3. Claude events
  const claudeAgents = {};
  allEvents.filter(e => e.source === 'claude').forEach(e => {
    const key = e.title || e.lot || 'Agent Claude';
    if (!claudeAgents[key] || new Date(e.t) > new Date(claudeAgents[key].t)) {
      claudeAgents[key] = { ...e, startTime: claudeAgents[key]?.startTime || e.t };
    }
  });
  state.claude = Object.values(claudeAgents).map(c => {
    const diffMs = Date.now() - new Date(c.startTime);
    return {
      title: c.title || c.lot,
      status: c.status || 'info',
      duration: c.status === 'fait' ? 'Terminé' : `${Math.floor(diffMs / 60000)} min`,
      details: c.details || ''
    };
  });

  // 4. Gradium / Generations
  state.gradium = allEvents
    .filter(e => e.kind === 'generation')
    .slice(-15) // keep last 15
    .reverse();

  // 5. Lots from plan/SUIVI.md
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
  const presetsDir = path.join(ROOT_DIR, 'public', 'assets', 'presets');

  const findFiles = (dir, extList, fileList = []) => {
    if(!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        findFiles(fullPath, extList, fileList);
      } else if (extList.some(ext => file.endsWith(ext))) {
        fileList.push({ path: fullPath.replace(ROOT_DIR, '').replace(/\\/g, '/'), mtime: stat.mtimeMs });
      }
    }
    return fileList;
  };

  const sortByMtime = (files) => files.sort((a, b) => b.mtime - a.mtime).map(f => f.path);

  state.results.captures = sortByMtime([
    ...findFiles(capturesDir, ['.png', '.jpg']),
    ...findFiles(presetsDir, ['.jpg'])
  ]).slice(-5);
  
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
  const voicesDir = path.join(ROOT_DIR, 'public', 'assets', 'voices');
  state.results.presets = safeReadJson(path.join(ROOT_DIR, 'public', 'assets', 'presets', 'presets.json'));
  state.results.voices = safeReadJson(path.join(ROOT_DIR, 'public', 'assets', 'voices', 'manifest.json'));
  state.results.presetAudio = sortByMtime([
    ...findFiles(presetsDir, ['.wav']),
    ...findFiles(voicesDir, ['.wav', '.mp3'])
  ]).slice(-5);

  return state;
}


// --- HTTP Server ---
const PORT = process.env.PORT || 4545;

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
    const html = safeRead(path.join(__dirname, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(html);
  }
  
  if (req.url === '/style.css' || req.url === '/script.js') {
    const file = safeRead(path.join(__dirname, req.url.substring(1)));
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
