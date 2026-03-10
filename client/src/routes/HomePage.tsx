import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';

import { createBoard, deleteBoard as deleteBoardRequest, fetchBoardsByOwner } from '../lib/api';
import { buildBoardUrl } from '../lib/boardUrl';
import { copyTextToClipboard } from '../lib/clipboard';
import { env } from '../env';
import { useAuth } from '../state/auth';
import type { Board } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const { user, signInWithGoogle, signOut, isGoogleConfigured } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState('');
  const [myBoards, setMyBoards] = useState<Board[]>([]);
  const [isLoadingBoards, setIsLoadingBoards] = useState(false);
  const [boardsError, setBoardsError] = useState<string | null>(null);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [copiedBoardId, setCopiedBoardId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [pendingDeleteBoard, setPendingDeleteBoard] = useState<Board | null>(null);
  const isAuthenticatedCreator = Boolean(user && user.isGuest !== true);
  const [avatarErrored, setAvatarErrored] = useState(false);

  const refreshBoards = useCallback(async () => {
    if (!user || user.isGuest) {
      setMyBoards([]);
      setBoardsError(null);
      setIsLoadingBoards(false);
      return;
    }

    const ownerId = user.id;
    setIsLoadingBoards(true);
    setBoardsError(null);
    try {
      const boards = await fetchBoardsByOwner(ownerId);
      if (user?.id !== ownerId) {
        return;
      }
      setMyBoards(boards);
    } catch (err) {
      if (user?.id !== ownerId) {
        return;
      }
      setBoardsError(
        err instanceof Error ? err.message : 'Failed to load your boards. Try again.'
      );
    } finally {
      if (user?.id === ownerId) {
        setIsLoadingBoards(false);
      }
    }
  }, [user]);

  const handleCopyBoardLink = useCallback(
    async (boardId: string) => {
      const shareUrl = buildBoardUrl(boardId);
      try {
        await copyTextToClipboard(shareUrl);
        setCopiedBoardId(boardId);
        setBoardsError(null);
      } catch (err) {
        setBoardsError(
          err instanceof Error ? err.message : 'Failed to copy board link. Try again.'
        );
      }
    },
    []
  );

  const handleDeleteBoard = useCallback(
    (board: Board) => {
      if (!user) {
        return;
      }
      setPendingDeleteBoard(board);
      setBoardsError(null);
      setError(null);
    },
    [user]
  );

  const closeDeleteModal = useCallback(() => {
    setPendingDeleteBoard(null);
    setBoardsError(null);
  }, []);

  const confirmDeleteBoard = useCallback(async () => {
    if (!pendingDeleteBoard) {
      return;
    }
    setDeletingBoardId(pendingDeleteBoard.id);
    try {
      await deleteBoardRequest(pendingDeleteBoard.id);
      await refreshBoards();
      closeDeleteModal();
    } catch (err) {
      setBoardsError(
        err instanceof Error ? err.message : 'Failed to delete board. Try again.'
      );
    } finally {
      setDeletingBoardId(null);
    }
  }, [closeDeleteModal, pendingDeleteBoard, refreshBoards]);

  const formatTimestamp = useCallback((iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }, []);

  useEffect(() => {
    setAvatarErrored(false);
  }, [user?.avatarUrl]);

  useEffect(() => {
    void refreshBoards();
  }, [refreshBoards]);

  useEffect(() => {
    setCopiedBoardId(null);
    setDeletingBoardId(null);
    setIsCreateModalOpen(false);
    setNewBoardName('');
  }, [user?.id]);

  useEffect(() => {
    if (!copiedBoardId) {
      return;
    }
    const timeout = setTimeout(() => setCopiedBoardId(null), 2000);
    return () => {
      clearTimeout(timeout);
    };
  }, [copiedBoardId]);

  const closeCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setNewBoardName('');
    setError(null);
  }, []);

  const submitCreateBoard = useCallback(async () => {
    if (!isAuthenticatedCreator || !user) {
      setError('Please sign in with Google before creating a board.');
      return;
    }

    const trimmedName = newBoardName.trim();
    if (!trimmedName) {
      setError('Give your board a name first.');
      return;
    }

    try {
      setIsCreating(true);
      setError(null);
      const { board } = await createBoard({
        name: trimmedName,
        owner: {
          id: user.id,
          name: user.name,
          avatarUrl: user.avatarUrl ?? undefined,
          email: user.email ?? undefined
        }
      });
      await refreshBoards();
      closeCreateModal();
      navigate(`/boards/${board.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsCreating(false);
    }
  }, [closeCreateModal, isAuthenticatedCreator, navigate, newBoardName, refreshBoards, user]);

  const handleJoinBoard = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = joinInput.trim();
    if (!trimmed) {
      setError('Paste a board URL or ID to join.');
      return;
    }
    try {
      const url = new URL(trimmed, window.location.href);
      const hashPath = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
      const hashMatch = hashPath.match(/^\/boards\/([^/?#]+)/);
      const pathMatch = url.pathname.match(/\/boards\/([^/?#]+)/);
      const id = hashMatch?.[1] ?? pathMatch?.[1] ?? trimmed;
      navigate(`/boards/${id}`);
    } catch {
      navigate(`/boards/${trimmed}`);
    }
  };

  return (
    <>
      <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem'
      }}
    >
      <div style={{ maxWidth: 920, width: '100%' }}>
        <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <p style={{ letterSpacing: '0.3em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
            Gather your quorum of ideas
          </p>
          <h1 style={{ fontSize: '2.75rem', margin: '0.5rem 0 0' }}>Welcome to Quorvium</h1>
          <p style={{ color: 'rgba(226,232,240,0.75)' }}>
            Spin up a board, invite your team, and brainstorm ideas together in real time.
          </p>
        </header>

        <section className="card" style={{ marginBottom: '1.5rem' }}>
          {user ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                {user.avatarUrl && !avatarErrored ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name ?? 'Signed in user'}
                    onError={() => setAvatarErrored(true)}
                    style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div
                    aria-hidden
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'rgba(148,163,184,0.25)',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 600
                    }}
                  >
                    {(user.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(226,232,240,0.75)' }}>
                    Signed in as
                  </p>
                  <p style={{ margin: 0, fontWeight: 600 }}>{user.name}</p>
                  {user.email && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(226,232,240,0.75)' }}>
                      {user.email}
                    </p>
                  )}
                </div>
              </div>
              <button className="btn btn-secondary" type="button" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <h2 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>Sign in with Google</h2>
                <p style={{ margin: 0, color: 'rgba(226,232,240,0.75)' }}>
                  Use your Google account to create new boards and collaborate with your team. If a
                  teammate shares a link, you can still join without signing in.
                </p>
              </div>
              {isGoogleConfigured ? (
                <GoogleSignInButton
                  onCode={async (code) => {
                    try {
                      await signInWithGoogle({ code });
                      setError(null);
                    } catch (err) {
                      setError(
                        err instanceof Error ? err.message : 'Google sign-in failed. Try again.'
                      );
                    }
                  }}
                  onError={() => setError('Google sign-in failed. Try again.')}
                />
              ) : (
                <p style={{ color: 'rgba(226,232,240,0.75)', margin: 0 }}>
                  Add <code>VITE_GOOGLE_CLIENT_ID</code> to enable Google sign-in.
                </p>
              )}
            </div>
          )}
        </section>

        {isAuthenticatedCreator && (
          <section className="card" style={{ marginBottom: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                marginBottom: '0.75rem',
                flexWrap: 'wrap'
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>My boards</h2>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setNewBoardName('');
                    setError(null);
                    setIsCreateModalOpen(true);
                  }}
                  disabled={isCreating}
                >
                  {isCreating ? 'Creating…' : 'Create board'}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    void refreshBoards();
                  }}
                  disabled={isLoadingBoards}
                >
                  {isLoadingBoards ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
            </div>
            {error && (
              <p style={{ color: '#f87171', margin: '0 0 0.75rem', fontSize: '0.9rem' }}>
                {error}
              </p>
            )}
            {boardsError && (
              <p style={{ color: '#f87171', margin: '0 0 0.75rem', fontSize: '0.9rem' }}>
                {boardsError}
              </p>
            )}
            {isLoadingBoards && myBoards.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(226,232,240,0.75)' }}>
                Loading your boards…
              </p>
            ) : myBoards.length === 0 ? (
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(226,232,240,0.75)' }}>
                You haven&apos;t created any boards yet.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.5rem 0.75rem',
                          color: 'rgba(148,163,184,0.95)',
                          borderBottom: '1px solid rgba(148,163,184,0.2)'
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.5rem 0.75rem',
                          color: 'rgba(148,163,184,0.95)',
                          borderBottom: '1px solid rgba(148,163,184,0.2)'
                        }}
                      >
                        Created
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.5rem 0.75rem',
                          color: 'rgba(148,163,184,0.95)',
                          borderBottom: '1px solid rgba(148,163,184,0.2)'
                        }}
                      >
                        Updated
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.5rem 0.75rem',
                          color: 'rgba(148,163,184,0.95)',
                          borderBottom: '1px solid rgba(148,163,184,0.2)'
                        }}
                      >
                        Board Link
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.5rem 0.75rem',
                          color: 'rgba(148,163,184,0.95)',
                          borderBottom: '1px solid rgba(148,163,184,0.2)'
                        }}
                      >
                        Copy Board Link
                      </th>
                      <th
                        style={{
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          padding: '0.5rem 0.75rem',
                          color: 'rgba(148,163,184,0.95)',
                          borderBottom: '1px solid rgba(148,163,184,0.2)'
                        }}
                      >
                        Delete Board
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {myBoards.map((board) => {
                      const isDeleting = deletingBoardId === board.id;
                      return (
                        <tr key={board.id}>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderBottom: '1px solid rgba(148,163,184,0.1)',
                              fontWeight: 600
                            }}
                          >
                            {board.name}
                          </td>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderBottom: '1px solid rgba(148,163,184,0.1)'
                            }}
                          >
                            {formatTimestamp(board.createdAt)}
                          </td>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderBottom: '1px solid rgba(148,163,184,0.1)'
                            }}
                          >
                            {formatTimestamp(board.updatedAt)}
                          </td>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderBottom: '1px solid rgba(148,163,184,0.1)'
                            }}
                          >
                            <Link
                              to={`/boards/${board.id}`}
                              style={{
                                color: '#38bdf8',
                                fontWeight: 600
                              }}
                            >
                              Join board
                            </Link>
                          </td>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderBottom: '1px solid rgba(148,163,184,0.1)'
                            }}
                          >
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() => {
                                void handleCopyBoardLink(board.id);
                              }}
                            >
                              {copiedBoardId === board.id ? 'Copied!' : 'Copy link'}
                            </button>
                          </td>
                          <td
                            style={{
                              padding: '0.6rem 0.75rem',
                              borderBottom: '1px solid rgba(148,163,184,0.1)'
                            }}
                          >
                            <button
                              className="btn btn-secondary"
                              type="button"
                              onClick={() => {
                                void handleDeleteBoard(board);
                              }}
                              disabled={isDeleting}
                              style={{
                                backgroundColor: '#ef4444',
                                borderColor: '#ef4444',
                                color: '#0f172a'
                              }}
                            >
                              {isDeleting ? 'Deleting…' : 'Delete'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {!isAuthenticatedCreator && (
          <section className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Join an existing board</h2>
            <form onSubmit={handleJoinBoard}>
              <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                <span style={{ display: 'block', marginBottom: '0.4rem' }}>Board URL or ID</span>
                <input
                  className="input"
                  placeholder="https://quorvium.app/boards/..."
                  value={joinInput}
                  onChange={(event) => {
                    setJoinInput(event.target.value);
                    setError(null);
                  }}
                />
              </label>
              <button className="btn btn-secondary" type="submit" style={{ width: '100%' }}>
                Join board
              </button>
            </form>
          </section>
        )}
        {!isAuthenticatedCreator && error && (
          <p style={{ color: '#f87171', marginTop: '-1rem', fontSize: '0.9rem' }}>{error}</p>
        )}
      </div>
    </div>
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-board-heading"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 1000
          }}
          onClick={closeCreateModal}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 420,
              padding: '1.75rem'
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="create-board-heading" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Create a new board
            </h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitCreateBoard();
              }}
            >
              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <span style={{ display: 'block', marginBottom: '0.4rem' }}>Board name</span>
                <input
                  className="input"
                  value={newBoardName}
                  onChange={(event) => {
                    setNewBoardName(event.target.value);
                    setError(null);
                  }}
                  placeholder="e.g. Quarterly Planning"
                  autoFocus
                />
              </label>
              {error && (
                <p style={{ color: '#f87171', margin: '0 0 1rem', fontSize: '0.9rem' }}>{error}</p>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={closeCreateModal}
                  disabled={isCreating}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={isCreating || newBoardName.trim().length === 0}
                >
                  {isCreating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {pendingDeleteBoard && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-board-heading"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15,23,42,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            zIndex: 1000
          }}
          onClick={closeDeleteModal}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 420, padding: '1.75rem' }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-board-heading" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Delete board
            </h2>
            <p style={{ margin: '0 0 0.75rem', color: 'rgba(226,232,240,0.85)' }}>
              You&apos;re about to delete
              <span style={{ fontWeight: 600 }}> {pendingDeleteBoard.name}</span>. This will remove the board and all of its notes for everyone.
            </p>
            {boardsError && (
              <p style={{ color: '#f87171', margin: '0 0 0.75rem', fontSize: '0.9rem' }}>
                {boardsError}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={closeDeleteModal}
                disabled={Boolean(deletingBoardId)}
              >
                Cancel
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  void confirmDeleteBoard();
                }}
                disabled={Boolean(deletingBoardId)}
                style={{
                  backgroundColor: '#ef4444',
                  borderColor: '#ef4444',
                  color: '#0f172a'
                }}
              >
                {deletingBoardId ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface GoogleSignInButtonProps {
  onCode: (code: string) => Promise<void> | void;
  onError: () => void;
}

function GoogleSignInButton({ onCode, onError }: GoogleSignInButtonProps) {
  const login = useGoogleLogin({
    flow: 'auth-code',
    redirect_uri: env.googleRedirectUri,
    onSuccess: async (response) => {
      if (response.code) {
        try {
          await onCode(response.code);
        } catch {
          onError();
        }
      } else {
        onError();
      }
    },
    onError: () => {
      onError();
    }
  });

  return (
    <button className="btn btn-primary" type="button" onClick={() => login()}>
      Sign in with Google
    </button>
  );
}
