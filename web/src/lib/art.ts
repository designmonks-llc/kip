// Kip's nature art: free Unsplash photos (Unsplash licence), cropped to fixed shapes so the
// pixel-mosaic tiles can line up with the photo underneath.

const unsplash = (id: string, w: number, h: number, fy = 0.5) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&crop=focalpoint&fp-x=0.5&fp-y=${fy}&w=${w}&h=${h}&q=78`;

export interface Art { src: string; w: number; h: number }

export const ART = {
  /** Deep blue sky fading into white clouds over a green hill: the Home hero. */
  sky: { src: unsplash('1493364391862-bb90969a4cc1', 2400, 800, 0.6), w: 2400, h: 800 },
  /** Open green hill under a soft blue sky: empty states. */
  hill: { src: unsplash('1592205644721-2fe5214762ae', 1600, 800), w: 1600, h: 800 },
  /** Soft clouds: behind the frosted floating sticky. */
  clouds: { src: unsplash('1599561251802-6e232cacc745', 1200, 1600), w: 1200, h: 1600 },
} satisfies Record<string, Art>;

export interface Cover { id: string; name: string; art: Art | null; thumb: string; custom?: boolean }

/** Home cover presets. Each is framed so white headline text stays readable; `art: null` is a calm gradient. */
export const COVERS: Cover[] = [
  { id: 'sky', name: 'Hill & sky', art: ART.sky, thumb: unsplash('1493364391862-bb90969a4cc1', 360, 150, 0.6) },
  { id: 'ranges', name: 'Misty ranges', art: { src: unsplash('1572994384812-d66fea58513f', 2400, 800, 0.55), w: 2400, h: 800 }, thumb: unsplash('1572994384812-d66fea58513f', 360, 150, 0.55) },
  { id: 'blue', name: 'Blue hour', art: { src: unsplash('1604856420566-576ba98b53cd', 2400, 800, 0.6), w: 2400, h: 800 }, thumb: unsplash('1604856420566-576ba98b53cd', 360, 150, 0.6) },
  { id: 'clouds', name: 'Cloud sea', art: { src: unsplash('1599561251802-6e232cacc745', 2400, 800, 0.45), w: 2400, h: 800 }, thumb: unsplash('1599561251802-6e232cacc745', 360, 150, 0.45) },
  { id: 'field', name: 'Open field', art: { src: unsplash('1592205644721-2fe5214762ae', 2400, 800, 0.55), w: 2400, h: 800 }, thumb: unsplash('1592205644721-2fe5214762ae', 360, 150, 0.55) },
  { id: 'mist', name: 'White mist', art: { src: unsplash('1546525012-4f79313b6de6', 2400, 800, 0.5), w: 2400, h: 800 }, thumb: unsplash('1546525012-4f79313b6de6', 360, 150, 0.5) },
  { id: 'calm', name: 'Calm gradient', art: null, thumb: '' },
];

/** CSS background for a cover (used by immersive mode for the whole window). */
export const coverBackground = (c: Cover) =>
  c.art ? `url("${c.art.src}")` : 'linear-gradient(165deg, #12307a 0%, #2a63d4 42%, #9fc6ee 78%, #eef5fd 100%)';

/** Small seeded random generator, so a mosaic looks the same every time. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type TileKind = 'shift' | 'white' | 'sky' | 'deep';
export interface Tile { col: number; row: number; kind: TileKind; dc: number; dr: number }

/**
 * Pixel-mosaic tiles: clusters of squares that either show a displaced piece of the photo
 * or are filled flat (white, sky, deep blue), like the photo is breaking into pixels.
 * `area` keeps clusters inside part of the image (fractions of width/height).
 */
export function mosaicTiles(cols: number, rows: number, seed: number, clusters: number, area = { x0: 0.45, x1: 1, y0: 0.1, y1: 0.9 }): Tile[] {
  const r = rng(seed);
  const taken = new Set<string>();
  const out: Tile[] = [];
  for (let c = 0; c < clusters; c++) {
    let col = Math.floor((area.x0 + r() * (area.x1 - area.x0)) * cols);
    let row = Math.floor((area.y0 + r() * (area.y1 - area.y0)) * rows);
    const size = 2 + Math.floor(r() * 7);
    for (let i = 0; i < size; i++) {
      const key = `${col},${row}`;
      if (col >= 0 && row >= 0 && col < cols && row < rows && !taken.has(key)) {
        taken.add(key);
        const p = r();
        // mostly displaced photo squares, a few flat ones, very rarely a deep-blue accent
        const kind: TileKind = p < 0.74 ? 'shift' : p < 0.88 ? 'white' : p < 0.97 ? 'sky' : 'deep';
        out.push({ col, row, kind, dc: Math.round((r() - 0.5) * 6), dr: Math.round((r() - 0.5) * 4) });
      }
      // wander to a neighbouring cell
      const d = Math.floor(r() * 4);
      col += d === 0 ? 1 : d === 1 ? -1 : 0;
      row += d === 2 ? 1 : d === 3 ? -1 : 0;
    }
  }
  return out;
}
