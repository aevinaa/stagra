import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TelemetryProvider } from './context/TelemetryContext';
import { Header } from './components/layout/Header';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { DataSourceBanner } from './components/common/DataSourceBanner';

// Core Pages
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { History } from './pages/History';
import { Predictions } from './pages/Predictions';
import { Alerts } from './pages/Alerts';
import { System } from './pages/System';

export default function App() {
  return (
    <TelemetryProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
          
          {/* Top App Header with STAGRA project identity */}
          <Header />

          {/* Navigation Bar for the 6 core research pages */}
          <Navbar />

          {/* High-visibility SIMULATED DATA / Scenario Controller Banner */}
          <DataSourceBanner />

          {/* Main Content Workspace */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/history" element={<History />} />
              <Route path="/predictions" element={<Predictions />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/system" element={<System />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>

          {/* Research pipeline attribution footer */}
          <Footer />

        </div>
      </BrowserRouter>
    </TelemetryProvider>
  );
}
