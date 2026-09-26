// Hook « PreToolUse » : bloque les commandes qui peuvent détruire du travail ou fuiter la clé API.
import { readFileSync } from 'node:fs';
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
const cmd = String(input.tool_input?.command || '');

const regles = [
  [/git\s+push\s+.*(--force\b|-f\b|\+\S)/, 'push forcé interdit (y compris "git push origin +branche") : il écrase le travail du coéquipier.'],
  [/git\s+add\s+(\S+\s+)*\S*\.env(\.(?!example)[\w-]+)?(\s|$)/, "le fichier .env contient la clé API : il ne doit jamais être commité."],
  [/\b(cat|type|Get-Content|gc|more|less|head|tail|grep|sed|node|Select-String|sls)\b[\s\S]*?\.env\b(?!\.example)/i, 'lecture de .env bloquée (insensible à la casse) : la clé API ne doit jamais apparaître dans la conversation.'],
  [/rm\s+-rf?\s+(\/|~|\.|\*)(\s|$)/, 'suppression massive bloquée.'],
  [/git\s+clean\s+(\S+\s+)*(-[a-z]*f[a-z]*\b|--force\b)/, 'git clean supprime des fichiers non sauvegardés : demande à l\'humain.'],
  [/git\s+checkout\s+--\s+\.(\s|$)/, 'git checkout -- . écrase tous les changements non commités : demande à l\'humain.'],
  [/git\s+restore\s+(?!.*--staged\b)(\S+\s+)*\.(\s|$)/, 'git restore . écrase les changements non commités : demande à l\'humain.'],
];
for (const [re, msg] of regles) {
  if (re.test(cmd)) { process.stderr.write(`Bloqué par le garde-fou : ${msg}\n`); process.exit(2); }
}
process.exit(0);
