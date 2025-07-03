import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css'; // App.css import

// Page component imports (files only created at this stage)
import AgentMonitorPage from './pages/AgentMonitorPage.tsx';
import GlobalDashboardPage from './pages/GlobalDashboardPage.tsx';
import StakingClaimPage from './pages/StakingClaimPage.tsx';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

function App() {
  return (
    <Router>
      <div className="container">
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1>
            <img src="/logo192.png" alt="HAiO Logo" style={{ height: '40px', marginRight: '15px' }} />
            HAiO Agent Demo
          </h1>
          <nav style={{ display: 'flex', gap: '15px' }}>
            <Link to="/" style={linkStyle}>Staking & Claim</Link>
            <Link to="/dashboard" style={linkStyle}>Global Dashboard</Link>
            <Link to="/agent" style={linkStyle}>Agent Monitor</Link>
            <WalletMultiButton style={{ /* existing button style */ }} />
          </nav>
        </header>

        <Routes>
          <Route path="/" element={<StakingClaimPage />} />
          <Route path="/dashboard" element={<GlobalDashboardPage />} />
          <Route path="/agent" element={<AgentMonitorPage />} />
        </Routes>
      </div>
    </Router>
  );
}

// Simple link style
const linkStyle = {
  textDecoration: 'none',
  color: '#5a2e91',
  fontWeight: 'bold' as 'bold', // Type specification
  padding: '5px 10px',
  borderRadius: '4px',
  transition: 'background-color 0.2s ease'
};
// TODO: Add active link style

export default App; // App component export