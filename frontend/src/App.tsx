import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css'; // App.css 임포트

// 페이지 컴포넌트 임포트 (아직 파일만 생성된 상태)
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
            <WalletMultiButton style={{ /* 기존 버튼 스타일 */ }} />
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

// 간단한 링크 스타일
const linkStyle = {
  textDecoration: 'none',
  color: '#5a2e91',
  fontWeight: 'bold' as 'bold', // 타입 명시
  padding: '5px 10px',
  borderRadius: '4px',
  transition: 'background-color 0.2s ease'
};
// TODO: 활성 링크 스타일 추가

export default App; // App 컴포넌트 export