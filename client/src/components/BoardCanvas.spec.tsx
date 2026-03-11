import { render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoardCanvas, sanitizeNotePosition } from './BoardCanvas';

const board = {
  id: 'board-1',
  name: 'Board',
  owner: {
    id: 'owner-1',
    name: 'Owner'
  },
  createdAt: '2026-03-10T12:00:00.000Z',
  updatedAt: '2026-03-10T12:00:00.000Z',
  notes: {
    'note-1': {
      id: 'note-1',
      body: 'Card body',
      color: '#fde68a',
      x: 100,
      y: 120,
      createdAt: '2026-03-10T12:00:00.000Z',
      updatedAt: '2026-03-10T12:00:00.000Z'
    }
  }
};

describe('BoardCanvas drag interactions', () => {
  const originalSetPointerCapture = HTMLElement.prototype.setPointerCapture;
  const originalReleasePointerCapture = HTMLElement.prototype.releasePointerCapture;
  const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: vi.fn()
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: vi.fn(() => true)
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: originalSetPointerCapture
    });
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: originalReleasePointerCapture
    });
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: originalHasPointerCapture
    });
    vi.restoreAllMocks();
  });

  it('does not crash on rapid pointer move/up while dragging a note', () => {
    const onCreateNote = vi.fn();
    const onUpdateNote = vi.fn();
    const onDeleteNote = vi.fn();

    render(
      <BoardCanvas
        board={board}
        onCreateNote={onCreateNote}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
      />
    );

    const handle = screen.getByText('Sticky').closest('div') as HTMLDivElement;

    expect(() => {
      act(() => {
        fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 120 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 160 });
        fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140, clientY: 160 });
      });
    }).not.toThrow();

    expect(onUpdateNote).toHaveBeenCalledTimes(1);
    expect(onUpdateNote).toHaveBeenCalledWith(
      'note-1',
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number)
      })
    );
  });

  it('allows unbounded positive coordinates and rejects invalid values', () => {
    expect(sanitizeNotePosition(50000, 50000)).toEqual({ x: 50000, y: 50000 });
    expect(sanitizeNotePosition(-200, -300)).toEqual({ x: 0, y: 0 });
    expect(sanitizeNotePosition(Number.NaN, 10)).toBeNull();
    expect(sanitizeNotePosition(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});
