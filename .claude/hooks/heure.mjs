// Hook « UserPromptSubmit » : à chaque message envoyé, rappelle en une ligne l'heure et le
// temps restant avant le gel des fonctionnalités (18h), l'opt-in (19h) et la démo (20h).
const now = new Date();
const at = (h, m = 0) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d; };
const mins = (d) => Math.round((d - now) / 60000);
const fmt = (m) => (m <= 0 ? 'passé' : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`);

const hhmm = now.toTimeString().slice(0, 5);
console.log(`Il est ${hhmm} — gel des fonctionnalités dans ${fmt(mins(at(18)))} (18:00), opt-in 19:00, démo 20:00`);
