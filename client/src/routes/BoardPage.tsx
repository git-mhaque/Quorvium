import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BoardCanvas } from '../components/BoardCanvas';
import { fetchBoard, renameBoard } from '../lib/api';
import { buildBoardUrl } from '../lib/boardUrl';
import { copyTextToClipboard } from '../lib/clipboard';
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
  const socketRef = useRef<BoardSocket>(createBoardSocket());
  const boardNameInputRef = useRef<HTMLInputElement>(null);
  const [isConnected, setIsConnected] = useState(false);

  const shareUrl = useMemo(() => {
    if (!boardId) {
      return '';
    }
    return buildBoardUrl(boardId);
  }, [boardId]);

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
        minHeight: '100vh',
        padding: '1.5rem 2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        position: 'relative'
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {isEditingBoardName ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitBoardName();
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
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
                    width: 'min(28rem, 75vw)',
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
                <h1 style={{ margin: 0, fontSize: '1.9rem' }}>{board.name}</h1>
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
          <p style={{ margin: '0.35rem 0', color: 'rgba(226,232,240,0.75)', fontSize: '0.95rem' }}>
            Share this link with your team: <code>{shareUrl}</code>
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                void copyTextToClipboard(shareUrl)
                  .then(() => setFeedback(null))
                  .catch(() => setFeedback('Unable to copy link to clipboard.'));
              }}
            >
              Copy link
            </button>
            <span style={{ fontSize: '0.85rem', color: 'rgba(148,163,184,0.9)' }}>
              {isConnected ? 'Connected' : 'Connecting…'} · {participants} active collaborator
              {participants > 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          Home
        </button>
      </header>

      <main style={{ flex: 1 }}>
        <BoardCanvas
          board={board}
          onCreateNote={handleCreateNote}
          onUpdateNote={handleUpdateNote}
          onDeleteNote={handleDeleteNote}
        />
      </main>
      {feedback && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
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
