// Hook Claude Code → journal du tableau de bord. Appelé par .claude/settings.json :
//   PreToolUse (outil Agent) avec l'argument « start », SubagentStop avec « stop ».
// Il lit le JSON du hook sur stdin et n'échoue jamais (code 0), pour ne pas bloquer Claude.
import fs from 'node:fs';
import { log } from './log.mjs';

let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch {}
const phase = process.argv[2];
const ti = input.tool_input || {};

if (phase === 'start') {
  const modele = ti.model || (ti.subagent_type === 'directeur-artistique' || ti.subagent_type === 'critique-aaa' || ti.subagent_type === 'chasseur-de-wow' || ti.subagent_type === 'animateur-exigeant' ? 'opus' : 'hérité');
  log({
    source: 'claude', kind: 'agent', status: 'en-cours',
    title: ti.description || 'Sous-agent Claude',
    model: `claude-${modele}`,
    agent: ti.subagent_type || 'general-purpose',
    background: Boolean(ti.run_in_background),
    worktree: ti.isolation === 'worktree',
  });
} else if (phase === 'stop') {
  log({
    source: 'claude', kind: 'agent', status: 'fait',
    title: 'Un sous-agent Claude a terminé',
    agent: input.agent_type || input.subagent_type || undefined,
    session: input.session_id || undefined,
  });
}
process.exit(0);
