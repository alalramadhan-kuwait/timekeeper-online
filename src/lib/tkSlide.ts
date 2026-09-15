/**
 * The TK Instagram slide, rendered in the browser.
 *
 * This follows the same three-layer template the `timekeeper-post` skill
 * renders with Puppeteer — photo, template overlay, right-to-left headline
 * boxes — so a slide built here from a news story looks like every other TK
 * post. The geometry below is the skill's, kept in its units on purpose: if the
 * template changes, the two renderers have to change together.
 *
 * It draws on a canvas rather than screenshotting HTML because the app is a
 * static site with no renderer to call, and because the browser's own text
 * engine shapes Arabic correctly in `fillText`.
 *
 * The artwork is not in this repo. `White_temp.png`, `Black_temp.png` and the
 * Bahij font are licensed assets that live in the `brand-assets` storage
 * bucket; upload them once and every slide is pixel-exact. Until then a slide
 * still renders — photo and headline, no overlay, system Arabic font — and the
 * page says so rather than pretending the output is final.
 */
import { supabase } from './supabase';

export const SLIDE_W = 1080;
export const SLIDE_H = 1350;

// Layer 3 geometry, straight from the template.
const BOX_INSET_R = 52;
const BOX_INSET_L = 52;
const BOX_BOTTOM = 196;
const BOX_PAD_X = 22;
const BOX_PAD_T = 5;
const BOX_PAD_B = 6;
const BOX_GAP = 7;
const BOX_MAX_W = 940;
const FONT_MAX = 78;
const FONT_MIN = 32;
const LINE_HEIGHT = 1.02;

const FONT_FAMILY = '"Bahij Helvetica Neue Bold", "Bahij Helvetica Neue", "Noto Kufi Arabic", "Segoe UI", Tahoma, sans-serif';

export type Palette = 'auto' | 'dark' | 'light';

export interface SlideSpec {
  imageUrl: string;
  top: string;
  bottom: string;
  /** false renders a content slide: photo + overlay, no headline boxes. */
  titleBoxes: boolean;
  palette: Palette;
}

export interface RenderResult {
  blob: Blob;
  /** What the renderer could not find, so the page can say it plainly. */
  missing: { overlay: boolean; font: boolean };
}

/* ---------------- assets ---------------- */

const assetUrl = (path: string) => supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Without this the canvas is tainted and toBlob() throws — which is also
    // why the sync mirrors article photos into our own storage.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

const overlayCache = new Map<string, HTMLImageElement | null>();
async function loadOverlay(variant: 'White' | 'Black'): Promise<HTMLImageElement | null> {
  const key = `${variant}_temp.png`;
  if (overlayCache.has(key)) return overlayCache.get(key) ?? null;
  const img = await loadImage(assetUrl(key)).catch(() => null);
  overlayCache.set(key, img);
  return img;
}

let fontState: 'unknown' | 'loaded' | 'absent' = 'unknown';
/** The licensed headline font, if someone has uploaded it. */
async function ensureFont(): Promise<boolean> {
  if (fontState !== 'unknown') return fontState === 'loaded';
  try {
    const face = new FontFace('Bahij Helvetica Neue Bold', `url(${assetUrl('Bahij-Helvetica-Neue-Bold.ttf')})`);
    await face.load();
    document.fonts.add(face);
    fontState = 'loaded';
  } catch {
    fontState = 'absent';
  }
  return fontState === 'loaded';
}

/* ---------------- brightness ---------------- */

/** Mean perceived luminance, 0–255, of a region of the canvas. */
function luminance(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): number {
  const { data } = ctx.getImageData(x, y, Math.max(1, w), Math.max(1, h));
  let sum = 0;
  // Every 16th pixel is plenty for a bright/dark decision and keeps this cheap.
  const step = 4 * 16;
  let n = 0;
  for (let i = 0; i < data.length; i += step) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return n ? sum / n : 128;
}

/* ---------------- drawing ---------------- */

/** object-fit: cover — fill the frame, crop the overflow, keep the centre. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement) {
  const scale = Math.max(SLIDE_W / img.naturalWidth, SLIDE_H / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (SLIDE_W - w) / 2, (SLIDE_H - h) / 2, w, h);
}

/** Shrink until the line fits on one line, exactly as the template does. */
function fitFontSize(ctx: CanvasRenderingContext2D, line: string, maxTextW: number): number {
  for (let size = FONT_MAX; size >= FONT_MIN; size -= 2) {
    ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(line).width <= maxTextW) return size;
  }
  return FONT_MIN;
}

function drawHeadline(ctx: CanvasRenderingContext2D, lines: string[], boxBg: string, textColor: string) {
  const maxTextW = Math.min(BOX_MAX_W, SLIDE_W - BOX_INSET_L - BOX_INSET_R) - BOX_PAD_X * 2;
  const laid = lines.map((line) => {
    const size = fitFontSize(ctx, line, maxTextW);
    ctx.font = `bold ${size}px ${FONT_FAMILY}`;
    const textW = Math.min(ctx.measureText(line).width, maxTextW);
    const lineH = size * LINE_HEIGHT;
    return { line, size, boxW: textW + BOX_PAD_X * 2, boxH: lineH + BOX_PAD_T + BOX_PAD_B, lineH };
  });

  const stackH = laid.reduce((s, l) => s + l.boxH, 0) + BOX_GAP * (laid.length - 1);
  let y = SLIDE_H - BOX_BOTTOM - stackH;
  const rightEdge = SLIDE_W - BOX_INSET_R;

  for (const l of laid) {
    ctx.fillStyle = boxBg;
    ctx.fillRect(rightEdge - l.boxW, y, l.boxW, l.boxH);

    ctx.fillStyle = textColor;
    ctx.font = `bold ${l.size}px ${FONT_FAMILY}`;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.line, rightEdge - BOX_PAD_X, y + BOX_PAD_T + l.lineH / 2, l.boxW - BOX_PAD_X * 2);

    y += l.boxH + BOX_GAP;
  }
}

/* ---------------- entry point ---------------- */

export async function renderSlide(spec: SlideSpec): Promise<RenderResult> {
  const [photo, fontLoaded] = await Promise.all([loadImage(spec.imageUrl), ensureFont()]);

  const canvas = document.createElement('canvas');
  canvas.width = SLIDE_W;
  canvas.height = SLIDE_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas is unavailable in this browser');

  // Layer 1 — photo
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SLIDE_W, SLIDE_H);
  drawCover(ctx, photo);

  // Layer 2 — template overlay. Bright photo takes the white template, dark
  // photo the black one, matching chooseOverlayVariant() in the skill.
  const overallLum = spec.palette === 'auto'
    ? luminance(ctx, 0, 0, SLIDE_W, SLIDE_H)
    : spec.palette === 'light' ? 255 : 0;
  const overlay = await loadOverlay(overallLum >= 128 ? 'White' : 'Black');
  if (overlay) ctx.drawImage(overlay, 0, -25, SLIDE_W, SLIDE_H);

  // Layer 3 — headline boxes, cover slide only
  const lines = [spec.top, spec.bottom].map((l) => l.trim()).filter(Boolean);
  if (spec.titleBoxes && lines.length > 0) {
    // The title zone is sampled on its own: a dark watch on a bright background
    // still needs a readable box where the text actually sits.
    const zoneH = 300;
    const zoneY = Math.max(0, SLIDE_H - BOX_BOTTOM - zoneH);
    const zoneLum = luminance(ctx, BOX_INSET_L, zoneY, SLIDE_W - BOX_INSET_L - BOX_INSET_R, zoneH);
    const brightZone = zoneLum >= 128;
    drawHeadline(ctx, lines, brightZone ? '#0f172a' : '#ffffff', brightZone ? '#ffffff' : '#0f172a');
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('the slide could not be exported');
  return { blob, missing: { overlay: !overlay, font: !fontLoaded } };
}

/** Render the carousel: a cover with the headline, then plain content slides. */
export async function renderCarousel(spec: Omit<SlideSpec, 'titleBoxes'>, slides: number): Promise<RenderResult[]> {
  const out: RenderResult[] = [];
  for (let i = 0; i < slides; i++) {
    out.push(await renderSlide({ ...spec, titleBoxes: i === 0 }));
  }
  return out;
}
