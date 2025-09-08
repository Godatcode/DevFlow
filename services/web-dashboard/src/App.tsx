import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Workflows from './pages/Workflows';
import Analytics from './pages/Analytics';
import Teams from './pages/Teams';
import Settings from './pages/Settings';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { AuthProvider } from './contexts/AuthContext';

function App() {
  console.log('App component rendering...');
  
  return (
    <div className="min-h-screen bg-gray-50">
      <AuthProvider>
        <RealtimeProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workflows" element={<Workflows />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </RealtimeProvider>
      </AuthProvider>
    </div>
  );
}

export default App;