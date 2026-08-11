import { describe, expect, test } from 'bun:test';
import {
  applyDiagramView,
  anchorDiagramZoom,
  clampDiagramPan,
  clampDiagramZoom,
  fitDiagramBoundsToViewport,
  getAppliedDiagramViewBox,
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

  test('derives the centered zoomed viewBox', () => {
    expect(getAppliedDiagramViewBox(
      { x: 10, y: 20, width: 200, height: 100 },
      2,
      { x: 0, y: 0 },
    )).toEqual({ x: 60, y: 45, width: 100, height: 50 });
  });

  test('derives the zoomed viewBox with pan already clamped by callers', () => {
    const base = { x: 10, y: 20, width: 200, height: 100 };
    const zoom = clampDiagramZoom(100);
    const pan = clampDiagramPan(base, zoom, { x: 999, y: -999 });

    expect(getAppliedDiagramViewBox(base, zoom, pan))
      .toEqual({ x: 185, y: 20, width: 25, height: 12.5 });
  });

  test('returns the same viewBox it writes to the SVG', () => {
    let viewBoxAttribute = '';
    const svg = {
      setAttribute(name: string, value: string) {
        if (name === 'viewBox') viewBoxAttribute = value;
      },
    } as unknown as SVGSVGElement;
    const base = { x: 10, y: 20, width: 200, height: 100 };
    const pan = { x: 15, y: -10 };

    expect(applyDiagramView(svg, base, 2, pan))
      .toEqual(getAppliedDiagramViewBox(base, 2, pan));
    expect(viewBoxAttribute).toBe('75 35 100 50');
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
