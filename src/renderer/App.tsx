import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/Toast';
import { UpdateBanner } from './components/UpdateBanner';
import Library from './routes/Library';
import VideoDetail from './routes/VideoDetail';
import SettingsPage from './routes/Settings';
import NewVideo from './routes/NewVideo';
import SessionDetail from './routes/SessionDetail';
import PlayerWindow from './routes/PlayerWindow';

function Shell() {
  return (
    <div className="h-full flex flex-col">
      <UpdateBanner />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/video/:id" element={<VideoDetail />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/new" element={<NewVideo />} />
            <Route path="/sessions/:id" element={<SessionDetail />} />
          </Routes>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        {/* Popped-out player window — bare, no sidebar/banner chrome. */}
        <Route path="/player/:id" element={<PlayerWindow />} />
        <Route path="/*" element={<Shell />} />
      </Routes>
    </HashRouter>
  );
}
