import { describe, expect, it } from 'vitest';
import { fitView, hudStrip, roomTiles, roomZoom } from '../../src/game/view';

describe('fitView', () => {
  it('uses the largest integer scale that fills a 16:9 window', () => {
    const view = fitView(1920, 1080);
    expect(view.zoom).toBe(4);
    expect(view.width * view.zoom).toBe(1920);
    expect(view.height * view.zoom).toBe(1080);
    const worldH = view.height - hudStrip(view.width, view.height) * 2;
    const tiles = roomTiles(view.width, worldH);
    expect(tiles.cols * 16).toBeGreaterThanOrEqual(view.width);
    expect(tiles.rows * 16).toBeGreaterThanOrEqual(worldH);
    expect(roomZoom(view.width, worldH, tiles.cols * 16, tiles.rows * 16)).toBe(1);
  });

  it('grows the buffer so a taller window is not letterboxed', () => {
    const view = fitView(1440, 900);
    expect(view.zoom).toBe(3);
    expect(view.width * view.zoom).toBe(1440);
    expect(view.height * view.zoom).toBe(900);
    expect(view.height).toBeGreaterThan(270);
  });

  it('drops to 1x when 2x would overflow', () => {
    const view = fitView(800, 600);
    expect(view.zoom).toBe(1);
    expect(view.width).toBe(800);
    expect(view.height).toBe(600);
  });
});

describe('roomZoom', () => {
  it('fits a start room inside the view instead of cropping to the floor', () => {
    const zoom = roomZoom(960, 476, 272, 272);
    expect(zoom).toBe(1);
    expect(272 * zoom).toBeLessThanOrEqual(476);
    expect(272 * zoom).toBeLessThanOrEqual(960);
  });

  it('zooms in by an integer when the room is much smaller than the view', () => {
    expect(roomZoom(800, 640, 200, 200)).toBe(3);
  });

  it('stays at 1 when the room is already larger than the view', () => {
    expect(roomZoom(240, 180, 400, 400)).toBe(1);
  });
});
