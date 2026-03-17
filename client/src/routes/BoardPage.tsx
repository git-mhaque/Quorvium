import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BoardCanvas } from '../components/BoardCanvas';
import { NOTE_COLORS, NOTE_MIN_HEIGHT, NOTE_WIDTH } from '../components/boardCanvas.constants';
import { fetchBoard, renameBoard } from '../lib/api';
import { createBoardSocket } from '../lib/socket';
import type { BoardSocket } from '../lib/socket';
import { useAuth } from '../state/auth';
import type { Board, StickyNote } from '../types';

const DEFAULT_MIN_ZOOM = 0.1;
const ABSOLUTE_MIN_ZOOM = 0.02;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const RESET_MARGIN = 120;
const VIEWPORT_SIDE_MARGIN = 16;
const VIEWPORT_BOTTOM_MARGIN = 24;

function clampZoom(value: number, minZoom: number, maxZoom = MAX_ZOOM) {
  return Math.max(minZoom, Math.min(maxZoom, value));
}

function firstFiniteNumber(...values: number[]) {
  return values.find((value) => Number.isFinite(value));
}

function readPointerPosition(event: {
  clientX: number;
  clientY: number;
  pageX: number;
  pageY: number;
  screenX: number;
  screenY: number;
}) {
  const x = firstFiniteNumber(event.clientX, event.pageX, event.screenX);
  const y = firstFiniteNumber(event.clientY, event.pageY, event.screenY);
  if (x === undefined || y === undefined) {
    return null;
  }
  return { x, y };
}

export function BoardPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [board, setBoard] = useState<Board | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [participants, setParticipants] = useState<number>(1);
  const [isEditingBoardName, setIsEditingBoardName] = useState(false);
  const [boardNameDraft, setBoardNameDraft] = useState('');
  const [isSavingBoardName, setIsSavingBoardName] = useState(false);
  const [isBoardTitleActionsVisible, setIsBoardTitleActionsVisible] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [paletteDrag, setPaletteDrag] = useState<{ pointerId: number; color: string } | null>(null);
  const [paletteDragPointer, setPaletteDragPointer] = useState<{ x: number; y: number } | null>(null);
  const paletteDragPointerRef = useRef<{ x: number; y: number } | null>(null);
  const socketRef = useRef<BoardSocket>(createBoardSocket());
  const boardViewportRef = useRef<HTMLDivElement>(null);
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const overlayPanelRef = useRef<HTMLElement>(null);
  const autoFitBoardIdRef = useRef<string | null>(null);
  const shouldAutoFitFromSocketRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);

  const isBoardCreator = Boolean(user && board && board.owner?.id === user.id);
  const calculateFitForBoard = useCallback((targetBoard: Board) => {
    if (typeof window === 'undefined') {
      return null;
    }

    const notes = Object.values(targetBoard.notes);
    if (notes.length === 0) {
      return null;
    }

    const minX = Math.min(...notes.map((note) => note.x));
    const minY = Math.min(...notes.map((note) => note.y));
    const maxX = Math.max(...notes.map((note) => note.x + NOTE_WIDTH));
    const maxY = Math.max(...notes.map((note) => note.y + NOTE_MIN_HEIGHT));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);

    const overlayHeight = overlayPanelRef.current?.getBoundingClientRect().height ?? 0;
    const viewportX = VIEWPORT_SIDE_MARGIN;
    const viewportY = Math.ceil(overlayHeight + VIEWPORT_BOTTOM_MARGIN);
    const viewportWidth = Math.max(240, window.innerWidth - viewportX * 2);
    const viewportHeight = Math.max(180, window.innerHeight - viewportY - VIEWPORT_BOTTOM_MARGIN);

    const fitScale = Math.min(
      viewportWidth / (contentWidth + RESET_MARGIN * 2),
      viewportHeight / (contentHeight + RESET_MARGIN * 2)
    );
    const nextScale = clampZoom(fitScale, ABSOLUTE_MIN_ZOOM);
    const contentPixelWidth = (contentWidth + RESET_MARGIN * 2) * nextScale;
    const contentPixelHeight = (contentHeight + RESET_MARGIN * 2) * nextScale;
    const extraX = Math.max(0, (viewportWidth - contentPixelWidth) / 2);
    const extraY = Math.max(0, (viewportHeight - contentPixelHeight) / 2);

    return {
      scale: nextScale,
      offset: {
        x: viewportX + extraX - (minX - RESET_MARGIN) * nextScale,
        y: viewportY + extraY - (minY - RESET_MARGIN) * nextScale
      }
    };
  }, []);

  const fitView = board ? calculateFitForBoard(board) : null;
  const minZoom = fitView
    ? Math.max(ABSOLUTE_MIN_ZOOM, Math.min(DEFAULT_MIN_ZOOM, fitView.scale))
    : DEFAULT_MIN_ZOOM;

  useEffect(() => {
    if (!board || isEditingBoardName) {
      return;
    }
    setBoardNameDraft(board.name);
  }, [board, isEditingBoardName]);

  useEffect(() => {
    if (!isEditingBoardName) {
      return;
    }
    boardNameInputRef.current?.focus();
    boardNameInputRef.current?.select();
  }, [isEditingBoardName]);

  useEffect(() => {
    if (!boardId) {
      navigate('/');
      return;
    }

    let isActive = true;
    setFatalError(null);
    fetchBoard(boardId)
      .then((fetched) => {
        if (!isActive) {
          return;
        }
        setBoard(fetched);
      })
      .catch((err) => {
        if (!isActive) {
          return;
        }
        const message =
          err instanceof Error && 'response' in err ? 'Board not found.' : 'Failed to load board.';
        setFatalError(message);
      });

    return () => {
      isActive = false;
    };
  }, [boardId, navigate]);

  useEffect(() => {
    if (!boardId) {
      return;
    }

    const socket = socketRef.current;

    const handleBoardState = ({ board: nextBoard }: { board: Board }) => {
      shouldAutoFitFromSocketRef.current = true;
      setBoard(nextBoard);
    };

    const handleNoteCreated = (message: { boardId: string; note: StickyNote }) => {
      setBoard((prev) => {
        if (!prev) {
          return prev;
        }
        if (prev.id !== message.boardId) {
          return prev;
        }
        return {
          ...prev,
          notes: {
            ...prev.notes,
            [message.note.id]: message.note
          }
        };
      });
    };

    const handleNoteUpdated = (message: { boardId: string; note: StickyNote }) => {
      setBoard((prev) => {
        if (!prev) {
          return prev;
        }
        if (prev.id !== message.boardId) {
          return prev;
        }
        return {
          ...prev,
          notes: {
            ...prev.notes,
            [message.note.id]: message.note
          }
        };
      });
    };

    const handleNoteDeleted = (message: { boardId: string; noteId: string }) => {
      setBoard((prev) => {
        if (!prev) {
          return prev;
        }
        if (prev.id !== message.boardId) {
          return prev;
        }
        const { [message.noteId]: _removed, ...rest } = prev.notes;
        return {
          ...prev,
          notes: rest
        };
      });
    };

    const handleBoardPresence = (payload: { boardId: string; participants: number }) => {
      if (payload.boardId !== boardId) {
        return;
      }
      setParticipants(Math.max(1, payload.participants));
    };

    socket.removeAllListeners();
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('board:state', handleBoardState);
    socket.on('board:presence', handleBoardPresence);
    socket.on('note:created', handleNoteCreated);
    socket.on('note:updated', handleNoteUpdated);
    socket.on('note:deleted', handleNoteDeleted);

    socket.connect();
    socket.emit(
      'board:join',
      {
        boardId,
        user: user
          ? {
              id: user.id,
              name: user.name,
              avatarUrl: user.avatarUrl
            }
          : undefined
      },
      (response: { ok: boolean; error?: string }) => {
        if (!response.ok) {
          setFatalError(response.error ?? 'Failed to join board.');
        }
      }
    );

    return () => {
      socket.off('board:state', handleBoardState);
      socket.off('board:presence', handleBoardPresence);
      socket.off('note:created', handleNoteCreated);
      socket.off('note:updated', handleNoteUpdated);
      socket.off('note:deleted', handleNoteDeleted);
      socket.disconnect();
      socketRef.current = createBoardSocket();
    };
  }, [boardId, user]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.add('board-page-body');
    return () => {
      document.body.classList.remove('board-page-body');
    };
  }, []);

  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setParticipants(1);
    shouldAutoFitFromSocketRef.current = false;
  }, [boardId]);

  useEffect(() => {
    setScale((current) => clampZoom(current, minZoom));
  }, [minZoom]);

  const startBoardNameEditing = () => {
    if (!board || !isBoardCreator) {
      return;
    }
    setBoardNameDraft(board.name);
    setIsEditingBoardName(true);
  };

  const cancelBoardNameEditing = () => {
    setBoardNameDraft(board?.name ?? '');
    setIsEditingBoardName(false);
    setIsSavingBoardName(false);
  };

  const handleBoardNameInputBlur = () => {
    if (isSavingBoardName) {
      return;
    }
    cancelBoardNameEditing();
  };

  const handleBoardNameInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitBoardName();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelBoardNameEditing();
    }
  };

  const submitBoardName = async () => {
    if (!board || !user || !isBoardCreator) {
      return;
    }

    const nextName = boardNameDraft.trim();
    if (!nextName) {
      setFeedback('Board name cannot be empty.');
      return;
    }
    if (nextName === board.name) {
      setIsEditingBoardName(false);
      setFeedback(null);
      return;
    }

    setIsSavingBoardName(true);
    try {
      const updatedBoard = await renameBoard(board.id, {
        name: nextName,
        requesterId: user.id
      });
      setBoard(updatedBoard);
      setIsEditingBoardName(false);
      setFeedback(null);
    } catch (err) {
      const apiError = (
        err as { response?: { data?: { error?: string } } } | undefined
      )?.response?.data?.error;
      setFeedback(apiError ?? 'Could not rename board.');
    } finally {
      setIsSavingBoardName(false);
    }
  };

  const handleCreateNote = useCallback((noteOverride?: Partial<Pick<StickyNote, 'body' | 'color' | 'x' | 'y'>>) => {
    if (!socketRef.current || !boardId) {
      return;
    }
    const body = noteOverride?.body ?? 'New idea';
    const color =
      noteOverride?.color ??
      ['#fde68a', '#fca5a5', '#bfdbfe', '#bbf7d0', '#f5d0fe'][
        Math.floor(Math.random() * 5)
      ];
    socketRef.current.emit(
      'note:create',
      {
        boardId,
        note: {
          body,
          color,
          x: noteOverride?.x ?? Math.random() * 600 + 200,
          y: noteOverride?.y ?? Math.random() * 400 + 100,
          author: user
            ? {
                id: user.id,
                name: user.name,
                avatarUrl: user.avatarUrl
              }
            : undefined
        }
      },
      (response: { ok: boolean; error?: string }) => {
        if (!response.ok) {
          setFeedback(response.error ?? 'Could not create note.');
          return;
        }
        setFeedback(null);
      }
    );
  }, [boardId, user]);

  const createNoteFromPaletteDrop = useCallback(
    (color: string, clientX: number, clientY: number) => {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return;
      }

      const boardViewport = boardViewportRef.current;
      if (!boardViewport) {
        return;
      }

      const rect = boardViewport.getBoundingClientRect();
      const effectiveRect =
        rect.width > 0 && rect.height > 0
          ? rect
          : ({
              left: 0,
              top: 0,
              right: window.innerWidth,
              bottom: window.innerHeight
            } as Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>);

      if (
        clientX < effectiveRect.left ||
        clientX > effectiveRect.right ||
        clientY < effectiveRect.top ||
        clientY > effectiveRect.bottom
      ) {
        return;
      }

      const x = (clientX - offset.x) / scale - NOTE_WIDTH / 2;
      const y = (clientY - offset.y) / scale - NOTE_MIN_HEIGHT / 2;

      handleCreateNote({ color, x, y });
    },
    [handleCreateNote, offset.x, offset.y, scale]
  );

  const beginPaletteDrag = (color: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const nextPointer = (() => {
      const fromEvent = readPointerPosition(event.nativeEvent);
      if (fromEvent) {
        return fromEvent;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const fallbackX = Number.isFinite(rect.left + rect.width / 2) ? rect.left + rect.width / 2 : 0;
      const fallbackY = Number.isFinite(rect.top + rect.height / 2) ? rect.top + rect.height / 2 : 0;
      return { x: fallbackX, y: fallbackY };
    })();
    setPaletteDrag({ pointerId: event.pointerId, color });
    paletteDragPointerRef.current = nextPointer;
    setPaletteDragPointer(nextPointer);
  };

  useEffect(() => {
    if (!paletteDrag) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId && event.pointerId !== paletteDrag.pointerId) {
        return;
      }
      const nextPointer = readPointerPosition(event);
      if (!nextPointer) {
        return;
      }
      paletteDragPointerRef.current = nextPointer;
      setPaletteDragPointer(nextPointer);
    };

    const completeDrag = (event: PointerEvent) => {
      if (event.pointerId && event.pointerId !== paletteDrag.pointerId) {
        return;
      }

      if (event.type !== 'pointercancel') {
        const fallbackPointer = paletteDragPointerRef.current;
        const pointerFromEvent = readPointerPosition(event);
        const dropX = pointerFromEvent?.x ?? fallbackPointer?.x;
        const dropY = pointerFromEvent?.y ?? fallbackPointer?.y;
        if (dropX !== undefined && dropY !== undefined) {
          createNoteFromPaletteDrop(paletteDrag.color, dropX, dropY);
        }
      }
      setPaletteDrag(null);
      setPaletteDragPointer(null);
      paletteDragPointerRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', completeDrag);
    window.addEventListener('pointercancel', completeDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', completeDrag);
      window.removeEventListener('pointercancel', completeDrag);
    };
  }, [createNoteFromPaletteDrop, paletteDrag]);

  useEffect(() => {
    if (typeof document === 'undefined' || !paletteDrag) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'copy';
    document.body.style.userSelect = 'none';

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [paletteDrag]);

  const handleCanvasWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!event.ctrlKey || event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      const nextScale = clampZoom(Number((scale + direction * ZOOM_STEP).toFixed(2)), minZoom);
      if (nextScale === scale) {
        return;
      }

      // Keep the point under the cursor fixed while zooming.
      const worldX = (event.clientX - offset.x) / scale;
      const worldY = (event.clientY - offset.y) / scale;
      setScale(nextScale);
      setOffset({
        x: event.clientX - worldX * nextScale,
        y: event.clientY - worldY * nextScale
      });
    },
    [minZoom, offset.x, offset.y, scale]
  );

  const handleZoomOut = useCallback(() => {
    setScale((current) => clampZoom(Number((current - ZOOM_STEP).toFixed(2)), minZoom));
  }, [minZoom]);

  const handleZoomIn = useCallback(() => {
    setScale((current) => clampZoom(Number((current + ZOOM_STEP).toFixed(2)), minZoom));
  }, [minZoom]);

  const handleUpdateNote = (
    noteId: string,
    patch: Partial<Pick<StickyNote, 'body' | 'color' | 'x' | 'y'>>
  ) => {
    if (!socketRef.current || !boardId) {
      return;
    }
    const previous = board?.notes[noteId];

    setBoard((prev) => {
      if (!prev) {
        return prev;
      }
      const existing = prev.notes[noteId];
      if (!existing) {
        return prev;
      }
      const optimistic: StickyNote = {
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      return {
        ...prev,
        notes: {
          ...prev.notes,
          [noteId]: optimistic
        }
      };
    });

    socketRef.current.emit(
      'note:update',
      {
        boardId,
        noteId,
        patch
      },
      (response: { ok: boolean; error?: string }) => {
        if (!response.ok) {
          setFeedback(response.error ?? 'Could not update note.');
          setBoard((prev) => {
            if (!prev || !previous) {
              return prev;
            }
            return {
              ...prev,
              notes: {
                ...prev.notes,
                [noteId]: previous
              }
            };
          });
          return;
        }
        setFeedback(null);
      }
    );
  };

  const handleDeleteNote = (noteId: string) => {
    if (!socketRef.current || !boardId) {
      return;
    }
    socketRef.current.emit(
      'note:delete',
      {
        boardId,
        noteId
      },
      (response: { ok: boolean; error?: string }) => {
        if (!response.ok) {
          setFeedback(response.error ?? 'Could not delete note.');
          return;
        }
        setFeedback(null);
      }
    );
  };

  const resetView = useCallback(() => {
    if (!board) {
      return;
    }

    const fit = calculateFitForBoard(board);
    if (!fit) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    setScale(fit.scale);
    setOffset(fit.offset);
  }, [board, calculateFitForBoard]);

  useEffect(() => {
    if (!board) {
      return;
    }
    if (autoFitBoardIdRef.current === board.id) {
      return;
    }
    autoFitBoardIdRef.current = board.id;
    requestAnimationFrame(() => {
      resetView();
    });
  }, [board, resetView]);

  useEffect(() => {
    if (!board || !shouldAutoFitFromSocketRef.current) {
      return;
    }
    shouldAutoFitFromSocketRef.current = false;
    requestAnimationFrame(() => {
      resetView();
    });
  }, [board, resetView]);

  if (fatalError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div className="card">
          <p style={{ marginBottom: '1.5rem' }}>{fatalError}</p>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Go back home
          </button>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <p>Loading board…</p>
      </div>
    );
  }

  return (
    <div
      ref={boardViewportRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        overflow: 'hidden'
      }}
      onWheel={handleCanvasWheel}
    >
      <BoardCanvas
        board={board}
        onUpdateNote={handleUpdateNote}
        onDeleteNote={handleDeleteNote}
        scale={scale}
        offset={offset}
        onOffsetChange={setOffset}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 40,
          pointerEvents: 'none'
        }}
      >
        <section
          ref={overlayPanelRef}
          className="card"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            top: 16,
            left: 16,
            width: 'min(34rem, calc(100vw - 2rem))',
            maxWidth: 'calc(100vw - 2rem)',
            boxSizing: 'border-box',
            padding: '0.4rem 0.6rem',
            background: 'rgba(248,250,252,0.95)',
            border: '1px solid rgba(148,163,184,0.45)',
            borderRadius: 10,
            boxShadow: '0 14px 32px rgba(148,163,184,0.35)',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              minHeight: 30
            }}
          >
            <button
              type="button"
              aria-label="Home"
              onClick={() => navigate('/')}
              style={{
                border: '1px solid rgba(148,163,184,0.55)',
                background: '#ffffff',
                color: '#334155',
                borderRadius: 8,
                width: 28,
                height: 28,
                minWidth: 28,
                padding: 0,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20h14V9.5" />
              </svg>
            </button>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}
              onMouseEnter={isBoardCreator ? () => setIsBoardTitleActionsVisible(true) : undefined}
              onMouseLeave={isBoardCreator ? () => setIsBoardTitleActionsVisible(false) : undefined}
              onFocusCapture={isBoardCreator ? () => setIsBoardTitleActionsVisible(true) : undefined}
              onBlurCapture={
                isBoardCreator
                  ? (event) => {
                      const nextFocused = event.relatedTarget as Node | null;
                      if (nextFocused && event.currentTarget.contains(nextFocused)) {
                        return;
                      }
                      setIsBoardTitleActionsVisible(false);
                    }
                  : undefined
              }
            >
              {isEditingBoardName ? (
                <input
                  ref={boardNameInputRef}
                  aria-label="Board name"
                  value={boardNameDraft}
                  maxLength={80}
                  disabled={isSavingBoardName}
                  onBlur={handleBoardNameInputBlur}
                  onChange={(event) => setBoardNameDraft(event.target.value)}
                  onKeyDown={handleBoardNameInputKeyDown}
                  style={{
                    width: '100%',
                    maxWidth: '100%',
                    fontSize: '1rem',
                    fontWeight: 500,
                    lineHeight: 1.15,
                    padding: '0.2rem 0.4rem',
                    borderRadius: 8,
                    border: '1px solid rgba(148,163,184,0.65)',
                    background: '#ffffff',
                    color: '#0f172a'
                  }}
                />
              ) : (
                <>
                  <h1
                    onClick={isBoardCreator ? startBoardNameEditing : undefined}
                    onKeyDown={
                      isBoardCreator
                        ? (event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') {
                              return;
                            }
                            event.preventDefault();
                            startBoardNameEditing();
                          }
                        : undefined
                    }
                    tabIndex={isBoardCreator ? 0 : undefined}
                    title={isBoardCreator ? 'Click to rename board' : undefined}
                    style={{
                      margin: 0,
                      fontSize: '1.08rem',
                      fontWeight: 500,
                      letterSpacing: '-0.01em',
                      color: '#0f172a',
                      lineHeight: 1.15,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: isBoardCreator ? 'text' : 'default'
                    }}
                  >
                    {board.name}
                  </h1>
                  {isBoardCreator && isBoardTitleActionsVisible && (
                    <button
                      type="button"
                      aria-label="Rename board"
                      title="Rename board"
                      onClick={startBoardNameEditing}
                      style={{
                        border: '1px solid rgba(148,163,184,0.55)',
                        background: '#ffffff',
                        color: '#334155',
                        borderRadius: 8,
                        width: 28,
                        height: 28,
                        minWidth: 28,
                        padding: 0,
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        width="13"
                        height="13"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="m16.5 3.5 4 4L7 21H3v-4z" />
                      </svg>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        <section
          className="card"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            left: 16,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            alignItems: 'center',
            padding: '0.45rem 0.3rem',
            width: 50,
            borderRadius: 10,
            background: 'rgba(248,250,252,0.95)',
            border: '1px solid rgba(148,163,184,0.45)',
            boxShadow: '0 14px 32px rgba(148,163,184,0.35)',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              alignItems: 'center'
            }}
          >
            {NOTE_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label="Drag sticky note color"
                title="Drag to create sticky note"
                onPointerDown={(event) => beginPaletteDrag(color, event)}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 4,
                  border: '2px solid rgba(15, 23, 42, 0.4)',
                  backgroundColor: color,
                  cursor: 'grab',
                  touchAction: 'none'
                }}
              />
            ))}
          </div>
        </section>

        <section
          className="card"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            left: 16,
            bottom: 16,
            padding: '0.55rem 0.8rem',
            background: 'rgba(248,250,252,0.95)',
            border: '1px solid rgba(148,163,184,0.45)',
            borderRadius: 10,
            boxShadow: '0 14px 32px rgba(148,163,184,0.35)',
            backdropFilter: 'blur(8px)'
          }}
        >
          <span style={{ fontSize: '0.85rem', color: 'rgba(71,85,105,0.95)', fontWeight: 600 }}>
            {isConnected ? 'Connected' : 'Connecting…'} · {participants} active collaborator
            {participants > 1 ? 's' : ''}
          </span>
        </section>

        <section
          className="card"
          style={{
            pointerEvents: 'auto',
            position: 'absolute',
            right: 16,
            bottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            padding: '0.55rem 0.8rem',
            background: 'rgba(248,250,252,0.95)',
            border: '1px solid rgba(148,163,184,0.45)',
            borderRadius: 10,
            boxShadow: '0 14px 32px rgba(148,163,184,0.35)',
            backdropFilter: 'blur(8px)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={handleZoomOut}
              style={{
                border: '1px solid rgba(148,163,184,0.55)',
                background: '#ffffff',
                color: '#334155',
                borderRadius: 8,
                width: 32,
                height: 32,
                minWidth: 32,
                padding: 0,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
                <path d="M8 11h6" />
              </svg>
            </button>
            <span
              data-testid="zoom-value"
              style={{
                minWidth: 52,
                textAlign: 'center',
                fontWeight: 600,
                color: '#334155',
                fontVariantNumeric: 'tabular-nums'
              }}
            >
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in"
              onClick={handleZoomIn}
              style={{
                border: '1px solid rgba(148,163,184,0.55)',
                background: '#ffffff',
                color: '#334155',
                borderRadius: 8,
                width: 32,
                height: 32,
                minWidth: 32,
                padding: 0,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer'
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
                <path d="M11 8v6" />
                <path d="M8 11h6" />
              </svg>
            </button>
          </div>
          <button
            className="btn btn-secondary"
            type="button"
            aria-label="Reset view"
            title="Fit all notes in view"
            onClick={resetView}
            style={{
              background: '#ffffff',
              border: '1px solid rgba(148,163,184,0.55)',
              color: '#334155',
              borderRadius: 8,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              paddingInline: '0.65rem'
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 9V4h5" />
              <path d="M20 9V4h-5" />
              <path d="M4 15v5h5" />
              <path d="M20 15v5h-5" />
            </svg>
            Fit
          </button>
        </section>
      </div>
      {paletteDrag && paletteDragPointer && (
        <div
          style={{
            position: 'fixed',
            left: paletteDragPointer.x - 11,
            top: paletteDragPointer.y - 11,
            width: 22,
            height: 22,
            borderRadius: 5,
            border: '2px solid rgba(15, 23, 42, 0.6)',
            backgroundColor: paletteDrag.color,
            boxShadow: '0 10px 20px rgba(15,23,42,0.22)',
            pointerEvents: 'none',
            zIndex: 70
          }}
        />
      )}
      {feedback && (
        <div
          style={{
            position: 'fixed',
            bottom: 84,
            right: 24,
            background: 'rgba(248,113,113,0.95)',
            color: '#0f172a',
            padding: '0.75rem 1rem',
            borderRadius: 12,
            boxShadow: '0 12px 30px rgba(15,23,42,0.35)',
            fontWeight: 600
          }}
        >
          {feedback}
        </div>
      )}
    </div>
  );
}
