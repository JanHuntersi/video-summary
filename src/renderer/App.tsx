import { HashRouter, Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/Toast';
import Library from './routes/Library';
import VideoDetail from './routes/VideoDetail';
import SettingsPage from './routes/Settings';
import NewVideo from './routes/NewVideo';

export default function App() {
  return (
    <HashRouter>
      <div className="h-full flex">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Library />} />
            <Route path="/video/:id" element={<VideoDetail />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/new" element={<NewVideo />} />
          </Routes>
        </main>
        <ToastContainer />
      </div>
    </HashRouter>
  );
}
