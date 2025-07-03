import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import reportWebVitals from './reportWebVitals';

import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

require('@solana/wallet-adapter-react-ui/styles.css');

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Wallet Adapter configuration
const network = process.env.REACT_APP_RPC_URL || clusterApiUrl('devnet');
const wallets = [
    new PhantomWalletAdapter()
];

root.render(
    <ConnectionProvider endpoint={network}>
      <WalletProvider wallets={wallets} autoConnect children={undefined}>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
);

reportWebVitals();