import { useEffect, useMemo, useRef, useState } from 'react';

import type { Board, StickyNote } from '../types';

const NOTE_COLORS = ['#fde68a', '#fca5a5', '#bfdbfe', '#bbf7d0', '#f5d0fe'];
const BASE_BOARD_WIDTH = 1600;
const BASE_BOARD_HEIGHT = 1200;
const BOARD_PADDING = 600;
const NOTE_WIDTH = 220;
const NOTE_MIN_HEIGHT = 180;

export function sanitizeNotePosition(x: number, y: number): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return {
    x: Math.max(0, x),
    y: Math.max(0, y)
  };
}

interface BoardCanvasProps {
  board: Board;
  onCreateNote: (note?: Partial<Pick<StickyNote, 'body' | 'color'>>) => void;
  onUpdateNote: (noteId: string, patch: Partial<Pick<StickyNote, 'body' | 'color' | 'x' | 'y'>>) => void;
  onDeleteNote: (noteId: string) => void;
}

interface DragState {
  noteId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export function BoardCanvas({ board, onCreateNote, onUpdateNote, onDeleteNote }: BoardCanvasProps) {
  const notes = useMemo(() => Object.values(board.notes).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [board.notes]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragPreview, setDragPreview] = useState<Record<string, { x: number; y: number }>>({});
  const dragState = useRef<DragState | null>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    setDragPreview({});
  }, [board.id]);

  const notePositions = useMemo(() => {
    return notes.reduce<Record<string, { x: number; y: number }>>((acc, note) => {
      const preview = dragPreview[note.id];
      const source = preview ?? { x: note.x, y: note.y };
      acc[note.id] = sanitizeNotePosition(source.x, source.y) ?? { x: 0, y: 0 };
      return acc;
    }, {});
  }, [dragPreview, notes]);

  const boardSize = useMemo(() => {
    const minWidth = Math.ceil(BASE_BOARD_WIDTH / scale);
    const minHeight = Math.ceil(BASE_BOARD_HEIGHT / scale);

    let maxRight = 0;
    let maxBottom = 0;
    Object.values(notePositions).forEach((position) => {
      maxRight = Math.max(maxRight, position.x + NOTE_WIDTH);
      maxBottom = Math.max(maxBottom, position.y + NOTE_MIN_HEIGHT);
    });

    return {
      width: Math.max(minWidth, maxRight + BOARD_PADDING),
      height: Math.max(minHeight, maxBottom + BOARD_PADDING)
    };
  }, [notePositions, scale]);

  const getNotePosition = (note: StickyNote) => notePositions[note.id] ?? { x: 0, y: 0 };

  const handleNotePointerDown = (note: StickyNote, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const position = getNotePosition(note);
    dragState.current = {
      noteId: note.id,
      pointerId: event.pointerId,
      startX: position.x,
      startY: position.y,
      originX: event.clientX,
      originY: event.clientY
    };
  };

  const handleNotePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const currentDrag = dragState.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = (event.clientX - currentDrag.originX) / scale;
    const deltaY = (event.clientY - currentDrag.originY) / scale;
    const nextPosition = sanitizeNotePosition(
      currentDrag.startX + deltaX,
      currentDrag.startY + deltaY
    );
    if (!nextPosition) {
      return;
    }
    const { noteId } = currentDrag;
    setDragPreview((prev) => ({
      ...prev,
      [noteId]: nextPosition
    }));
  };

  const handleNotePointerUp = (note: StickyNote, event: React.PointerEvent<HTMLDivElement>) => {
    const currentDrag = dragState.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId) {
      return;
    }
    if (
      event.currentTarget.releasePointerCapture &&
      (!event.currentTarget.hasPointerCapture || event.currentTarget.hasPointerCapture(event.pointerId))
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const currentPosition = getNotePosition(note);
    const position = sanitizeNotePosition(currentPosition.x, currentPosition.y) ?? {
      x: Math.max(0, note.x),
      y: Math.max(0, note.y)
    };
    setDragPreview((prev) => {
      const next = { ...prev };
      delete next[note.id];
      return next;
    });
    dragState.current = null;
    onUpdateNote(note.id, { x: position.x, y: position.y });
  };

  const handlePanStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    isPanning.current = true;
    panStart.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y
    };
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const handlePanMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning.current) {
      return;
    }
    const deltaX = event.clientX - panStart.current.x;
    const deltaY = event.clientY - panStart.current.y;
    setOffset({
      x: panStart.current.offsetX + deltaX,
      y: panStart.current.offsetY + deltaY
    });
  };

  const handlePanEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning.current) {
      return;
    }
    isPanning.current = false;
    if (
      event.currentTarget.releasePointerCapture &&
      (!event.currentTarget.hasPointerCapture || event.currentTarget.hasPointerCapture(event.pointerId))
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="btn btn-primary" type="button" onClick={() => onCreateNote()}>
            Add sticky note
          </button>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {NOTE_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onCreateNote({ color })}
                type="button"
                title="Create note with color"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '999px',
                  border: '2px solid rgba(15, 23, 42, 0.4)',
                  backgroundColor: color,
                  cursor: 'pointer'
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Zoom
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
            />
            <span style={{ minWidth: 48, textAlign: 'right' }}>{Math.round(scale * 100)}%</span>
          </label>
          <button className="btn btn-secondary" type="button" onClick={() => setOffset({ x: 0, y: 0 })}>
            Reset view
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          borderRadius: 18,
          background: 'rgba(15, 23, 42, 0.8)',
          border: '1px solid rgba(148,163,184,0.2)',
          overflow: 'hidden',
          position: 'relative',
          cursor: isPanning.current ? 'grabbing' : 'grab'
        }}
        onPointerDown={handlePanStart}
        onPointerMove={handlePanMove}
        onPointerUp={handlePanEnd}
        onPointerCancel={handlePanEnd}
        onPointerLeave={handlePanEnd}
      >
        <div
          style={{
            width: `${boardSize.width}px`,
            height: `${boardSize.height}px`,
            transform: `translate(${offset.x}px, ${offset.y}px)`
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              position: 'relative',
              backgroundImage:
                'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
              backgroundSize: '80px 80px'
            }}
          >
            {notes.map((note) => {
              const position = getNotePosition(note);
              return (
                <div
                  key={note.id}
                  style={{
                    position: 'absolute',
                    width: 220,
                    minHeight: 180,
                    transform: `translate(${position.x}px, ${position.y}px)`,
                    backgroundColor: note.color,
                    borderRadius: 16,
                    boxShadow: '0 18px 32px rgba(15,23,42,0.25)',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div
                    onPointerDown={(event) => handleNotePointerDown(note, event)}
                    onPointerMove={handleNotePointerMove}
                    onPointerUp={(event) => handleNotePointerUp(note, event)}
                    onPointerCancel={(event) => handleNotePointerUp(note, event)}
                    onPointerLeave={(event) => handleNotePointerUp(note, event)}
                    style={{
                      padding: '0.5rem 0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'grab'
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#334155' }}>Sticky</span>
                    <button
                      onClick={() => onDeleteNote(note.id)}
                      type="button"
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: '#0f172a',
                        fontWeight: 600
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <textarea
                    defaultValue={note.body}
                    onBlur={(event) => {
                      const next = event.target.value.trim() || 'New idea';
                      if (next !== note.body) {
                        onUpdateNote(note.id, { body: next });
                      }
                    }}
                    placeholder="Add your idea…"
                    style={{
                      flex: 1,
                      border: 'none',
                      background: 'transparent',
                      resize: 'none',
                      outline: 'none',
                      padding: '0 0.75rem 0.75rem',
                      fontSize: '1rem',
                      color: '#1e293b'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.4rem', padding: '0.5rem 0.75rem' }}>
                    {NOTE_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => onUpdateNote(note.id, { color })}
                        type="button"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: '999px',
                          border: color === note.color ? '2px solid #1f2937' : '2px solid transparent',
                          backgroundColor: color,
                          cursor: 'pointer'
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
