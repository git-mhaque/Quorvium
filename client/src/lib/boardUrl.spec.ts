import { afterEach, describe, expect, it } from 'vitest';

import { env } from '../env';
import { buildBoardUrl } from './boardUrl';

describe('buildBoardUrl', () => {
  const originalRouterMode = env.routerMode;

  afterEach(() => {
    env.routerMode = originalRouterMode;
    window.history.replaceState({}, '', 'http://localhost/');
  });

  it('builds browser-mode absolute URL', () => {
    env.routerMode = 'browser';
    window.history.replaceState({}, '', 'http://localhost/some-page');

    expect(buildBoardUrl('board-1')).toBe('http://localhost/boards/board-1');
  });

  it('builds hash-mode URL and normalizes root path to index.html', () => {
    env.routerMode = 'hash';
    window.history.replaceState({}, '', 'http://localhost/');

    expect(buildBoardUrl('board-1')).toBe('http://localhost/index.html#/boards/board-1');
  });

  it('builds hash-mode URL from nested path and clears query string', () => {
    env.routerMode = 'hash';
    window.history.replaceState({}, '', 'http://localhost/app/view?foo=bar');

    expect(buildBoardUrl('board-1')).toBe('http://localhost/app/view#/boards/board-1');
  });
});
