import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BoardCanvas } from '../components/BoardCanvas';
import { NOTE_COLORS, NOTE_MIN_HEIGHT, NOTE_WIDTH } from '../components/boardCanvas.constants';
import { fetchBoard, renameBoard } from '../lib/api';
import { createBoardSocket } from '../lib/socket';
import type { BoardSocket } from '../lib/socket';
import { useAuth } from '../state/auth';
import type { Board, Participant, StickyNote } from '../types';

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
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const socketRef = useRef<BoardSocket>(createBoardSocket());
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const overlayPanelRef = useRef<HTMLElement>(null);
  const autoFitBoardIdRef = useRef<string | null>(null);
  const shouldAutoFitFromSocketRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);

  const isBoardCreator = Boolean(user && board && board.owner?.id === user.id);

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

    const handleUserJoined = (_payload: {
      boardId: string;
      user: Participant;
      joinedAt: string;
    }) => {
      setParticipants((prev) => prev + 1);
      setTimeout(() => setParticipants((prev) => Math.max(1, prev - 1)), 30000);
    };

    socket.removeAllListeners();
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('board:state', handleBoardState);
    socket.on('note:created', handleNoteCreated);
    socket.on('note:updated', handleNoteUpdated);
    socket.on('note:deleted', handleNoteDeleted);
    socket.on('board:user_joined', handleUserJoined);

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
      socket.off('note:created', handleNoteCreated);
      socket.off('note:updated', handleNoteUpdated);
      socket.off('note:deleted', handleNoteDeleted);
      socket.off('board:user_joined', handleUserJoined);
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
    shouldAutoFitFromSocketRef.current = false;
  }, [boardId]);

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

  const handleCreateNote = (noteOverride?: Partial<Pick<StickyNote, 'body' | 'color'>>) => {
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
          x: Math.random() * 600 + 200,
          y: Math.random() * 400 + 100,
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
  };

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
    if (typeof window === 'undefined' || !board) {
      return;
    }

    const notes = Object.values(board.notes);
    if (notes.length === 0) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      return;
    }

    const margin = 120;
    const minX = Math.min(...notes.map((note) => note.x));
    const minY = Math.min(...notes.map((note) => note.y));
    const maxX = Math.max(...notes.map((note) => note.x + NOTE_WIDTH));
    const maxY = Math.max(...notes.map((note) => note.y + NOTE_MIN_HEIGHT));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);

    const overlayHeight = overlayPanelRef.current?.getBoundingClientRect().height ?? 0;
    const viewportX = 16;
    const viewportY = Math.ceil(overlayHeight + 24);
    const viewportWidth = Math.max(240, window.innerWidth - viewportX * 2);
    const viewportHeight = Math.max(180, window.innerHeight - viewportY - 24);

    const fitScale = Math.min(
      viewportWidth / (contentWidth + margin * 2),
      viewportHeight / (contentHeight + margin * 2)
    );
    const nextScale = Math.max(0.5, Math.min(2, fitScale));
    const contentPixelWidth = (contentWidth + margin * 2) * nextScale;
    const contentPixelHeight = (contentHeight + margin * 2) * nextScale;
    const extraX = Math.max(0, (viewportWidth - contentPixelWidth) / 2);
    const extraY = Math.max(0, (viewportHeight - contentPixelHeight) / 2);

    setScale(nextScale);
    setOffset({
      x: viewportX + extraX - (minX - margin) * nextScale,
      y: viewportY + extraY - (minY - margin) * nextScale
    });
  }, [board]);

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
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        overflow: 'hidden'
      }}
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
            boxSizing: 'border-box'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              {isEditingBoardName ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitBoardName();
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: 1 }}
                >
                  <input
                    ref={boardNameInputRef}
                    className="input"
                    aria-label="Board name"
                    value={boardNameDraft}
                    maxLength={80}
                    disabled={isSavingBoardName}
                    onChange={(event) => setBoardNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelBoardNameEditing();
                      }
                    }}
                    style={{
                      width: 'min(22rem, calc(100vw - 8rem))',
                      fontSize: '1.1rem',
                      fontWeight: 600,
                      padding: '0.45rem 0.65rem'
                    }}
                  />
                  <button className="btn btn-secondary" type="submit" disabled={isSavingBoardName}>
                    {isSavingBoardName ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={isSavingBoardName}
                    onClick={cancelBoardNameEditing}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <h1 style={{ margin: 0, fontSize: '1.8rem' }}>{board.name}</h1>
                  {isBoardCreator && (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      aria-label="Rename board"
                      title="Rename board"
                      onClick={startBoardNameEditing}
                      style={{ padding: '0.35rem 0.55rem', minWidth: 'auto' }}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
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
            <button className="btn btn-secondary" onClick={() => navigate('/')}>
              Home
            </button>
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
            padding: '0.55rem',
            width: 56
          }}
        >
          <button
            className="btn btn-primary"
            type="button"
            aria-label="Add sticky note"
            title="Add sticky note"
            onClick={() => handleCreateNote()}
            style={{
              minWidth: 'auto',
              width: 38,
              height: 38,
              borderRadius: '999px',
              padding: 0,
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </button>
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
                onClick={() => handleCreateNote({ color })}
                type="button"
                title="Create note with color"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '999px',
                  border: '2px solid rgba(15, 23, 42, 0.4)',
                  backgroundColor: color,
                  cursor: 'pointer'
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
            padding: '0.55rem 0.8rem'
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
            padding: '0.55rem 0.8rem'
          }}
        >
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
          <button className="btn btn-secondary" type="button" onClick={resetView}>
            Reset view
          </button>
        </section>
      </div>
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
