import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { StatusProvider } from './lib/status';
import MeterPage from './pages/MeterPage';
import TodayPage from './pages/TodayPage';
import RumorsPage from './pages/RumorsPage';
import StoriesPage from './pages/StoriesPage';
import GuidelinesPage from './pages/GuidelinesPage';
import ReportPage from './pages/ReportPage';
import DashboardPage from './pages/DashboardPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <ToastProvider>
      <StatusProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/meter" replace />} />
            <Route path="/meter" element={<MeterPage />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/rumors" element={<RumorsPage />} />
            <Route path="/stories" element={<StoriesPage />} />
            <Route path="/guidelines" element={<GuidelinesPage />} />
            <Route path="/report" element={<ReportPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </StatusProvider>
    </ToastProvider>
  );
}
