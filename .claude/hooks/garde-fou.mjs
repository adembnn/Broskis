// Hook « PreToolUse » : bloque les commandes qui peuvent détruire du travail ou fuiter la clé API.
import { readFileSync } from 'node:fs';
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch {}
const cmd = String(input.tool_input?.command || '');

const regles = [
  [/git\s+push\s+.*(--force|-f\b)/, 'push forcé interdit : il écrase le travail du coéquipier.'],
  [/git\s+add\s+(\S+\s+)*\S*\.env(\.(?!example)[\w-]+)?(\s|$)/, "le fichier .env contient la clé API : il ne doit jamais être commité."],
  [/(cat|type|Get-Content|gc|more|less|head|tail)\s+(\S+\s+)*\S*\.env(\.(?!example)[\w-]+)?(\s|$)/, 'lecture de .env bloquée : la clé API ne doit pas apparaître dans la conversation.'],
  [/rm\s+-rf?\s+(\/|~|\.|\*)(\s|$)/, 'suppression massive bloquée.'],
  [/git\s+clean\s+-[a-z]*f/, 'git clean supprime des fichiers non sauvegardés : demande à l\'humain.'],
];
for (const [re, msg] of regles) {
  if (re.test(cmd)) { process.stderr.write(`Bloqué par le garde-fou : ${msg}\n`); process.exit(2); }
}
process.exit(0);
