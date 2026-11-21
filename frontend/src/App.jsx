// src/App.jsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Admin Components
import AdminLogin from './Components/Admin/Login';
import AdminLayout from './Components/Admin/AdminLayout';
import AdminDashboard from './Components/Admin/Dashboard';
import ProtectedAdminRoute from './Components/Admin/ProtectedAdminRoute';
import DoctorPage from './Components/Doctor/DoctorPage';

// MR Components
import MRLogin from './Components/MR/Login';
import MRLayout from './Components/Layouts/MRLayout';
import MRDashboard from './Components/MR/Dashboard';
import MyDoctors from './Components/MR/MyDoctors';
import SendConsent from './Components/MR/SendConsent';
import ProtectedMRRoute from './Components/MR/ProtectedMRRoute';

// Doctor/Public Components
import ConsentPage from './Components/Doctor/ConsentPage';
import ConsentSuccess from './Components/Doctor/ConsentSuccess';
// import ConfirmConsent from './Components/Doctor/ConfirmConsent';
import LoginSelection from './Components/LoginSelection';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default route - redirect based on role? Or show login selection */}
        <Route path="/" element={<LoginSelection />} />

        {/* ==================== ADMIN ROUTES ==================== */}
        <Route path="/admin/login" element={<AdminLogin />} />
       
        
        <Route path="/admin" element={
          <ProtectedAdminRoute>
            <AdminLayout />
          </ProtectedAdminRoute>
        }>
          <Route index element={<AdminDashboard />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="clients" element={<div>Clients Page (Coming Soon)</div>} />
          <Route path="campaigns" element={<div>Campaigns Page (Coming Soon)</div>} />
          <Route path="doctors" element={<div>Doctors Page (Coming Soon)</div>} />
          <Route path="bulk-upload" element={<div>Bulk Upload Page (Coming Soon)</div>} />
          <Route path="quizzes" element={<div>Quizzes Page (Coming Soon)</div>} />
          <Route path="doctor-pages" element={<div>Doctor Pages (Coming Soon)</div>} />
          <Route path="scenes" element={<div>Scenes & Videos (Coming Soon)</div>} />
          <Route path="qr-codes" element={<div>QR Codes (Coming Soon)</div>} />
          <Route path="analytics" element={<div>Analytics (Coming Soon)</div>} />
          <Route path="reports" element={<div>Reports (Coming Soon)</div>} />
          <Route path="users" element={<div>Users & Roles (Coming Soon)</div>} />
          <Route path="settings" element={<div>Settings (Coming Soon)</div>} />
          <Route path="logs" element={<div>Logs (Coming Soon)</div>} />
        </Route>

        {/* ==================== MR ROUTES ==================== */}
        <Route path="/mr/login" element={<MRLogin />} />
        
        <Route path="/mr" element={
          <ProtectedMRRoute>
            <MRLayout />
          </ProtectedMRRoute>
        }>
          <Route index element={<MRDashboard />} />
          <Route path="dashboard" element={<MRDashboard />} />
          <Route path="doctors" element={<MyDoctors />} />
          <Route path="send-consent" element={<SendConsent />} />
          <Route path="analytics" element={<div>Analytics Page (Coming Soon)</div>} />
        </Route>

        {/* ==================== PUBLIC/DOCTOR ROUTES ==================== */}
        <Route path="/consent/:token" element={<ConsentPage />} />
        <Route path="/consent/success" element={<ConsentSuccess />} />
         <Route path="/dr/:slug" element={<DoctorPage />} />
        {/* <Route path="/confirm/:token" element={<ConfirmConsent />} /> */}
      </Routes>
    </BrowserRouter>
  );
}

export default App;