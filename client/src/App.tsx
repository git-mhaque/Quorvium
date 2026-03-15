import { Navigate, Route, Routes } from 'react-router-dom';

import { env } from './env';
import { BoardPage } from './routes/BoardPage';
import { HomePage } from './routes/HomePage';

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/boards/:boardId" element={<BoardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <footer className="app-version-footer" aria-label="Application version">
        Version {env.appVersion}
      </footer>
    </>
  );
}

export default App;
