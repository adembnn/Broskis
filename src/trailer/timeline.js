// Montage du trailer, partagé par le jeu (src/trailer/, images) et par Node (tools/trailer/, musique).
// Unité : le temps musical (1 temps à 130 BPM = 0,4615 s). Chaque coupe tombe sur un temps.
// `music` : intensité de la musique générée pendant le plan (voir tools/trailer/music.mjs).

export const BPM = 130;
export const BEAT = 60 / BPM;

const run = (prefix, from, count, beats, music) =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i + 1}`, beats, music, at: from + i * beats }));

function sequence(list) {
  let at = 0;
  return list.flat().map((s) => {
    const shot = { ...s, at: s.at ?? at };
    at = shot.at + shot.beats;
    return shot;
  });
}

export const CUTS = {
  60: sequence([
    { id: 'hook', beats: 4, music: 'none' },
    { id: 'black', beats: 1, music: 'none' },
    { id: 'snap', beats: 4, music: 'intro' },
    { id: 'sticker', beats: 4, music: 'intro' },
    { id: 'card', beats: 4, music: 'intro' },
    { id: 'throw', beats: 4, music: 'build' },
    { id: 'fighter', beats: 6, music: 'build' },
    { id: 'title-lock', beats: 2, music: 'riser' },
    run('m', 29, 8, 4, 'drop'),
    run('e', 61, 12, 2, 'drop2'),
    run('f', 85, 4, 1, 'drop2'),
    { id: 'silence', beats: 1, music: 'none' },
    { id: 'climax', beats: 8, music: 'climax' },
    { id: 'ko', beats: 6, music: 'outro' },
    { id: 'black-end', beats: 2, music: 'none' },
    { id: 'title', beats: 10, music: 'end' },
  ]),
  15: sequence([
    { id: 'hook', beats: 4, music: 'none' },
    { id: 'snap', beats: 3, music: 'intro', trim: 1 },
    { id: 'sticker', beats: 3, music: 'intro' },
    { id: 'throw', beats: 4, music: 'build' },
    run('f', 14, 4, 1, 'drop2'),
    { id: 'climax', beats: 6, music: 'climax', trim: 2 },
    { id: 'title', beats: 8, music: 'end' },
  ]),
};

/** Images de début/fin de chaque plan pour une cadence donnée (fin exclue). */
export function planFrames(cut, fps) {
  const shots = CUTS[cut];
  if (!shots) throw new Error(`Coupe inconnue : ${cut}`);
  const frame = (beat) => Math.round(beat * BEAT * fps);
  return shots.map((s, index) => ({ ...s, index, start: frame(s.at), end: frame(s.at + s.beats) }));
}

export function totalBeats(cut) {
  const shots = CUTS[cut];
  const last = shots[shots.length - 1];
  return last.at + last.beats;
}
