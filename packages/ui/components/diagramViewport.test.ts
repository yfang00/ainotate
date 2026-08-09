import { describe, expect, test } from 'bun:test';
import {
  anchorDiagramZoom,
  clampDiagramPan,
  fitDiagramBoundsToViewport,
  getReadableDiagramZoom,
  panDiagramByPixels,
  parseDiagramViewBoxFromMarkup,
  rebaseDiagramPan,
  shouldInitializeDiagramViewport,
} from './diagramViewport';

describe('diagramViewport', () => {
  test('reads viewBox and dimension fallbacks from SVG markup', () => {
    expect(parseDiagramViewBoxFromMarkup('<svg viewBox="10 20 800 400">')).toEqual({
      x: 10,
      y: 20,
      width: 800,
      height: 400,
    });
    expect(parseDiagramViewBoxFromMarkup('<svg width="640pt" height="480pt">')).toEqual({
      x: 0,
      y: 0,
      width: 640,
      height: 480,
    });
  });

  test('fits bounds to the viewport without changing their center', () => {
    expect(fitDiagramBoundsToViewport(
      { x: 0, y: 0, width: 1200, height: 300 },
      { width: 600, height: 300 },
    )).toEqual({ x: 0, y: -150, width: 1200, height: 600 });
  });

  test('starts large diagrams at a readable but bounded zoom', () => {
    expect(getReadableDiagramZoom(
      { x: 0, y: 0, width: 3200, height: 1600 },
      { width: 800, height: 400 },
    )).toBe(4);
    expect(getReadableDiagramZoom(
      { x: 0, y: 0, width: 600, height: 300 },
      { width: 800, height: 400 },
    )).toBe(2);
  });

  test('keeps the diagram point beneath the pointer fixed while zooming', () => {
    expect(anchorDiagramZoom(
      { x: 0, y: 0, width: 1000, height: 500 },
      2,
      4,
      { x: 0, y: 0 },
      { width: 500, height: 250 },
      { x: 375, y: 125 },
    )).toEqual({ x: 62.5, y: 0 });
  });

  test('supports bounded two-dimensional panning in screen pixels', () => {
    const base = { x: 0, y: 0, width: 1000, height: 500 };
    expect(panDiagramByPixels(base, 2, { x: 0, y: 0 }, { width: 500, height: 250 }, { x: 50, y: 25 }))
      .toEqual({ x: 50, y: 25 });
    expect(clampDiagramPan(base, 2, { x: 999, y: -999 }))
      .toEqual({ x: 250, y: -125 });
    expect(clampDiagramPan(base, 1, { x: 20, y: 20 }))
      .toEqual({ x: 0, y: 0 });
  });

  test('preserves the visible center when a resized viewport changes the fitted base', () => {
    expect(rebaseDiagramPan(
      { x: 0, y: 0, width: 1000, height: 500 },
      { x: 0, y: 0, width: 1500, height: 500 },
      2,
      { x: 100, y: 50 },
    )).toEqual({ x: -150, y: 50 });
  });

  test('initializes each diagram container once without overwriting manual interaction', () => {
    const inlineContainer = {};
    const expandedContainer = {};

    expect(shouldInitializeDiagramViewport(null, inlineContainer, false)).toBe(true);
    expect(shouldInitializeDiagramViewport(inlineContainer, inlineContainer, false)).toBe(false);
    expect(shouldInitializeDiagramViewport(inlineContainer, expandedContainer, false)).toBe(true);
    expect(shouldInitializeDiagramViewport(inlineContainer, expandedContainer, true)).toBe(true);
    expect(shouldInitializeDiagramViewport(null, inlineContainer, true)).toBe(false);
  });
});
