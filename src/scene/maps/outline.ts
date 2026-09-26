// Contours 2D (XZ) partagés par le visuel et le collider : un bord dessiné = un bord jouable, au centimètre.
// Maths pures, sans THREE ni Rapier.

/** Contour d'un pont de navire, poupe à -X, proue effilée à +X, sens trigonométrique vu du dessus.
 *  `len` = longueur totale, `width` = largeur au maître-bau, `n` = points par bord. */
export function shipOutline(len: number, width: number, n = 20): [number, number][] {
  const halfW = width / 2;
  const side = (sign: number): [number, number][] => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = sign > 0 ? i / n : 1 - i / n;
      const bow = t > 0.74 ? Math.sqrt(Math.max(0, 1 - ((t - 0.74) / 0.26) ** 2)) : 1;
      const stern = t < 0.05 ? 0.86 + 0.14 * (t / 0.05) : 1;
      pts.push([-len / 2 + t * len, halfW * bow * stern * sign]);
    }
    return pts;
  };
  const a = side(1);
  const b = side(-1);
  // La pointe de la proue (t = 1) est commune aux deux bords : on ne la garde qu'une fois.
  return [...a, ...b.slice(1)];
}
