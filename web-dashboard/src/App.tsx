import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout';
import { useSession } from './lib/session';
import { AdminsPage } from './pages/Admins';
import { AnnouncementsPage } from './pages/Announcements';
import { AuditPage } from './pages/Audit';
import { BadgesPage } from './pages/Badges';
import { GroupDetailPage } from './pages/GroupDetail';
import { GroupsPage } from './pages/Groups';
import { LoginPage } from './pages/Login';
import { MessagesPage } from './pages/Messages';
import { OverviewPage } from './pages/Overview';
import { SystemPage } from './pages/System';
import { TransactionsPage } from './pages/Transactions';
import { UserDetailPage } from './pages/UserDetail';
import { UsersPage } from './pages/Users';

export function App() {
  const session = useSession((state) => state.session);
  // Not signed in: every address shows the sign-in screen. The API enforces access on its own for every request.
  if (!session) return <LoginPage />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<OverviewPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/:address" element={<UserDetailPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="groups/:id" element={<GroupDetailPage />} />
        <Route path="badges" element={<BadgesPage />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="announcements" element={<AnnouncementsPage />} />
        <Route path="admins" element={<AdminsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="system" element={<SystemPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
