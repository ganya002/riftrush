import { describe, expect, it } from 'vitest';
import { fitView, roomZoom } from '../../src/game/view';

describe('fitView', () => {
  it('uses the largest integer scale that fills a 16:9 window', () => {
    const view = fitView(1920, 1080);
    expect(view.zoom).toBe(4);
    expect(view.width * view.zoom).toBe(1920);
    expect(view.height * view.zoom).toBe(1080);
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
  it('covers a square room so the view is not wider than the floor', () => {
    const zoom = roomZoom(480, 270, 272, 272);
    expect(zoom).toBe(2);
    expect(480 / zoom).toBeLessThanOrEqual(272);
    expect(270 / zoom).toBeLessThanOrEqual(272);
  });

  it('stays at 1 when the room is already larger than the view', () => {
    expect(roomZoom(240, 180, 400, 400)).toBe(1);
  });
});
