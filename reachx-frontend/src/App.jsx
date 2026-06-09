import { Routes, Route, Navigate } from "react-router-dom";
import { isAuthenticated } from "./lib/auth";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import SetPasswordPage from "./pages/SetPasswordPage";
import ValidatePage from "./pages/ValidatePage";
import UnsubscribedPage from "./pages/UnsubscribedPage";

import DashboardPage from "./pages/dashboard/DashboardPage";
import CampaignsPage from "./pages/dashboard/CampaignsPage";
import NewCampaignPage from "./pages/dashboard/NewCampaignPage";
import CampaignDetailPage from "./pages/dashboard/CampaignDetailPage";
import ContactsPage from "./pages/dashboard/ContactsPage";
import SegmentsPage from "./pages/dashboard/SegmentsPage";
import WorkflowsPage from "./pages/dashboard/WorkflowsPage";
import NewWorkflowPage from "./pages/dashboard/NewWorkflowPage";
import WorkflowDetailPage from "./pages/dashboard/WorkflowDetailPage";
import AnalyticsPage from "./pages/dashboard/AnalyticsPage";
import ValidateDashboardPage from "./pages/dashboard/ValidateDashboardPage";
import SettingsPage from "./pages/dashboard/SettingsPage";
import PixelFolderPage from "./pages/dashboard/PixelFolderPage";

function PrivateRoute({ children }) {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/validate" element={<ValidatePage />} />
      <Route path="/unsubscribed" element={<UnsubscribedPage />} />

      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/dashboard/campaigns" element={<PrivateRoute><CampaignsPage /></PrivateRoute>} />
      <Route path="/dashboard/campaigns/new" element={<PrivateRoute><NewCampaignPage /></PrivateRoute>} />
      <Route path="/dashboard/campaigns/:id" element={<PrivateRoute><CampaignDetailPage /></PrivateRoute>} />
      <Route path="/dashboard/contacts" element={<PrivateRoute><ContactsPage /></PrivateRoute>} />
      <Route path="/dashboard/segments" element={<PrivateRoute><SegmentsPage /></PrivateRoute>} />
      <Route path="/dashboard/workflows" element={<PrivateRoute><WorkflowsPage /></PrivateRoute>} />
      <Route path="/dashboard/workflows/new" element={<PrivateRoute><NewWorkflowPage /></PrivateRoute>} />
      <Route path="/dashboard/workflows/:id" element={<PrivateRoute><WorkflowDetailPage /></PrivateRoute>} />
      <Route path="/dashboard/analytics" element={<PrivateRoute><AnalyticsPage /></PrivateRoute>} />
      <Route path="/dashboard/validate" element={<PrivateRoute><ValidateDashboardPage /></PrivateRoute>} />
      <Route path="/dashboard/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
      <Route path="/dashboard/pixels" element={<PrivateRoute><PixelFolderPage /></PrivateRoute>} />
    </Routes>
  );
}
