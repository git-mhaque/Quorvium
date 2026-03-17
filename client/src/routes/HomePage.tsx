import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';

import { createBoard, deleteBoard as deleteBoardRequest, fetchBoard, fetchBoardsByOwner } from '../lib/api';
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
  const [joinOverlayMessage, setJoinOverlayMessage] = useState<string | null>(null);
  const [isJoiningBoard, setIsJoiningBoard] = useState(false);
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
    setJoinOverlayMessage(null);
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

  const closeJoinOverlay = useCallback(() => {
    setJoinOverlayMessage(null);
  }, []);

  const handleJoinBoard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = joinInput.trim();
    if (!trimmed) {
      setJoinOverlayMessage('Paste a board URL or ID to join.');
      return;
    }

    const boardIdPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let boardIdCandidate = trimmed;
    try {
      const url = new URL(trimmed, window.location.href);
      const hashPath = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
      const hashMatch = hashPath.match(/^\/boards\/([^/?#]+)/);
      const pathMatch = url.pathname.match(/\/boards\/([^/?#]+)/);
      const extractedId = hashMatch?.[1] ?? pathMatch?.[1];
      if (!extractedId) {
        setJoinOverlayMessage('Could not read a board ID from that link. Paste a board URL or board ID.');
        return;
      }
      boardIdCandidate = extractedId;
    } catch {
      boardIdCandidate = trimmed;
    }

    if (!boardIdPattern.test(boardIdCandidate)) {
      setJoinOverlayMessage('That board ID looks invalid. Paste a valid board URL or board ID.');
      return;
    }

    setIsJoiningBoard(true);
    try {
      await fetchBoard(boardIdCandidate);
      navigate(`/boards/${boardIdCandidate}`);
    } catch (err) {
      const status = (err as { response?: { status?: number } } | undefined)?.response?.status;
      if (status === 404) {
        setJoinOverlayMessage('Board not found. Check the link and try again.');
      } else {
        setJoinOverlayMessage('Could not open this board right now. Please try again.');
      }
    } finally {
      setIsJoiningBoard(false);
    }
  };

  return (
    <>
      <div className="home-page">
        <div className="home-page-orb home-page-orb-a" aria-hidden />
        <div className="home-page-orb home-page-orb-b" aria-hidden />
        <div className="home-page-container">
          <section className="card home-panel home-topbar" style={{ marginBottom: '0.75rem' }}>
            <div className="home-topbar-brand">
              <span className="home-brand-icon" aria-hidden>
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M4 4h7v7H4z" />
                  <path d="M13 4h7v7h-7z" />
                  <path d="M4 13h7v7H4z" />
                  <path d="M16.5 13.5 20 20h-7z" />
                </svg>
              </span>
              <span className="home-brand-label">Quorvium</span>
            </div>
            <p className="home-topbar-center">Gather your quorum of ideas</p>
            <div className="home-topbar-auth">
              {user ? (
                <>
                  <div className="home-topbar-user">
                    {user.avatarUrl && !avatarErrored ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name ?? 'Signed in user'}
                        onError={() => setAvatarErrored(true)}
                        className="home-user-avatar home-topbar-avatar"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="home-user-avatar home-user-placeholder home-topbar-avatar"
                      >
                        {(user.name ?? '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="home-topbar-user-name">{user.name}</span>
                  </div>
                  <button className="btn btn-secondary" type="button" onClick={signOut}>
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <span className="sr-only">
                    Use your Google account to create new boards and collaborate with your team. If a
                    teammate shares a link, you can still join without signing in.
                  </span>
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
                    <p className="home-topbar-config">
                      Add <code>VITE_GOOGLE_CLIENT_ID</code>
                    </p>
                  )}
                </>
              )}
            </div>
          </section>

          <header className="home-hero">
            <h1 className="home-title">Welcome to Quorvium</h1>
            <p className="home-subtitle">
              Spin up a board, invite your team, and brainstorm ideas together in real time.
            </p>
            <div className="home-feature-row" aria-hidden>
              <span className="home-feature">Live collaboration</span>
              <span className="home-feature">Sticky notes</span>
              <span className="home-feature">Fast sharing</span>
            </div>
          </header>

          <section className="card home-panel home-join-panel" style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Join an existing Quorvium board</h2>
            <form className="home-join-form" onSubmit={handleJoinBoard}>
              <label className="home-join-input-wrap">
                <span style={{ display: 'block', marginBottom: '0.4rem' }}>Board URL or ID</span>
                <input
                  className="input"
                  placeholder="https://quorvium.app/boards/..."
                  value={joinInput}
                  disabled={isJoiningBoard}
                  onChange={(event) => {
                    setJoinInput(event.target.value);
                    setJoinOverlayMessage(null);
                  }}
                />
              </label>
              <button className="btn btn-secondary home-join-button" type="submit" disabled={isJoiningBoard}>
                {isJoiningBoard ? 'Joining…' : 'Join board'}
              </button>
            </form>
          </section>

          {!isAuthenticatedCreator && error && (
            <p style={{ color: '#f87171', marginTop: '-1rem', fontSize: '0.9rem' }}>{error}</p>
          )}

          {isAuthenticatedCreator && (
            <section className="card home-panel" style={{ marginBottom: '1.5rem' }}>
            <div
              className="home-section-header"
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
              <div className="home-table-wrap">
                <table className="home-boards-table">
                  <thead>
                    <tr>
                      <th>
                        Name
                      </th>
                      <th>
                        Created
                      </th>
                      <th>
                        Updated
                      </th>
                      <th>
                        Board Link
                      </th>
                      <th>
                        Copy Board Link
                      </th>
                      <th>
                        Delete Board
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {myBoards.map((board) => {
                      const isDeleting = deletingBoardId === board.id;
                      return (
                        <tr key={board.id}>
                          <td className="home-boards-name">
                            {board.name}
                          </td>
                          <td>
                            {formatTimestamp(board.createdAt)}
                          </td>
                          <td>
                            {formatTimestamp(board.updatedAt)}
                          </td>
                          <td>
                            <Link
                              to={`/boards/${board.id}`}
                              className="home-board-link"
                            >
                              Join board
                            </Link>
                          </td>
                          <td>
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
                          <td>
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
        </div>
      </div>
      {joinOverlayMessage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-error-heading"
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
          onClick={closeJoinOverlay}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 420, padding: '1.5rem' }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="join-error-heading" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Can&apos;t open board
            </h2>
            <p style={{ margin: 0, color: 'rgba(226,232,240,0.9)' }}>{joinOverlayMessage}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-secondary" type="button" onClick={closeJoinOverlay}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
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
