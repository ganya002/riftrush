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
 * Integer camera zoom that makes the room cover the view.
 * The visible world is never larger than the room, so the floor reaches the screen edge.
 */
export function roomZoom(viewW: number, viewH: number, roomW: number, roomH: number): number {
  const vw = Math.max(1, viewW);
  const vh = Math.max(1, viewH);
  const rw = Math.max(1, roomW);
  const rh = Math.max(1, roomH);
  const cover = Math.max(vw / rw, vh / rh);
  return Math.max(1, Math.ceil(cover - 1e-4));
}
