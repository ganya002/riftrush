/** Design size the hub and title were drawn for. */
export const BASE_WIDTH = 480;
export const BASE_HEIGHT = 270;

export interface FittedView {
  /** Largest integer canvas scale that still fits the window. */
  zoom: number;
  /** Internal width, in pixels, so zoom × width covers the window. */
  width: number;
  /** Internal height, in pixels, so zoom × height covers the window. */
  height: number;
}

/**
 * Top HUD strip in buffer pixels. Matches `hudTop`: scale 1 is 32px, and the
 * scale steps up with the 480×270 design size.
 */
export function hudStrip(width: number, height: number): number {
  const scale = Math.max(1, Math.floor(Math.min(width / BASE_WIDTH, height / BASE_HEIGHT)));
  return 32 * scale;
}

/**
 * Integer pixel scale that fills the browser.
 * The buffer grows past 480×270 when the window is wider or taller than that aspect,
 * so the canvas does not sit in a black letterbox.
 */
export function fitView(windowWidth: number, windowHeight: number): FittedView {
  const width = Math.max(1, Math.floor(windowWidth));
  const height = Math.max(1, Math.floor(windowHeight));
  const zoom = Math.max(1, Math.floor(Math.min(width / BASE_WIDTH, height / BASE_HEIGHT)));
  return {
    zoom,
    width: Math.floor(width / zoom),
    height: Math.floor(height / zoom),
  };
}

/**
 * Integer camera zoom that keeps the whole room, wall ring included, inside the view.
 */
export function roomZoom(viewW: number, viewH: number, roomW: number, roomH: number): number {
  const vw = Math.max(1, viewW);
  const vh = Math.max(1, viewH);
  const rw = Math.max(1, roomW);
  const rh = Math.max(1, roomH);
  const fit = Math.min(vw / rw, vh / rh);
  return Math.max(1, Math.floor(fit + 1e-4));
}

/** Tile counts that cover the view, so the wall ring lands on the screen edge. */
export function roomTiles(viewW: number, viewH: number, tile = 16): { cols: number; rows: number } {
  return {
    cols: Math.max(13, Math.ceil(Math.max(1, viewW) / tile)),
    rows: Math.max(13, Math.ceil(Math.max(1, viewH) / tile)),
  };
}
