import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BoardCanvas } from '../components/BoardCanvas';
import { fetchBoard } from '../lib/api';
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
  const socketRef = useRef<BoardSocket>(createBoardSocket());
  const [isConnected, setIsConnected] = useState(false);

  const shareUrl = useMemo(() => {
    if (!boardId) {
      return '';
    }
    return buildBoardUrl(boardId);
  }, [boardId]);

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
          <h1 style={{ margin: 0, fontSize: '1.9rem' }}>{board.name}</h1>
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
