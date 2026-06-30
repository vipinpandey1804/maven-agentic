import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import './index.css';
import { getToken, getRole, getUser } from './lib/api';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MyDashboard from './pages/MyDashboard';
import Employees from './pages/Employees';
import Batches from './pages/Batches';
import BatchDetail from './pages/BatchDetail';
import Agents from './pages/Agents';
import Leaves from './pages/Leaves';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';
import Profile from './pages/Profile';
import Users from './pages/Users';
import Tickets from './pages/Tickets';

function RequireAuth() {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// Reachable while authenticated but outside the main layout/guard.
function RequireAuthBare({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return children;
}

// Employees land on their own portal; staff land on the admin dashboard.
function Home() {
  return getRole() === 'employee' ? <Navigate to="/me" replace /> : <Dashboard />;
}

// Block staff-only pages for employee role.
function StaffOnly({ children }) {
  return getRole() === 'employee' ? <Navigate to="/me" replace /> : children;
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/change-password', element: <RequireAuthBare><ChangePassword /></RequireAuthBare> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <Layout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/me', element: <MyDashboard /> },
          { path: '/profile', element: <Profile /> },
          { path: '/employees', element: <StaffOnly><Employees /></StaffOnly> },
          { path: '/batches', element: <StaffOnly><Batches /></StaffOnly> },
          { path: '/batches/:id', element: <StaffOnly><BatchDetail /></StaffOnly> },
          { path: '/agents', element: <StaffOnly><Agents /></StaffOnly> },
          { path: '/leaves', element: <StaffOnly><Leaves /></StaffOnly> },
          { path: '/requests', element: <StaffOnly><Tickets /></StaffOnly> },
          { path: '/users', element: <StaffOnly><Users /></StaffOnly> },
          { path: '/settings', element: <StaffOnly><Settings /></StaffOnly> },
        ],
      },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
