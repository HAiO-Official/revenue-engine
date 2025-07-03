import React, { useMemo } from 'react'; // useMemo added
import '../App.css';
import { useSolanaDataPolling } from '../hooks/useSolanaDataPolling.ts'; // SolanaData type removed
import InfoCard from '../components/ui/InfoCard.tsx';
import { formatTokenAmount } from '../lib/utils.ts';
import { useConnection } from '@solana/wallet-adapter-react'; // useWallet removed
import * as anchor from '@coral-xyz/anchor';
import { PRECISION } from '../lib/solana.ts'; // Import PRECISION constant (should be BN type)
import { BN } from '@coral-xyz/anchor'; // BN import


const GlobalDashboardPage = () => {
    const { connection } = useConnection(); // Get connection to create provider
    const { data, isLoading, error, refetch } = useSolanaDataPolling(15000);

    const readOnlyProvider = useMemo(() => {
        // @ts-ignore
        return new anchor.AnchorProvider(connection, {} as any, { commitment: 'confirmed' });
    }, [connection]);

    const engineState = data?.revenueEngineInfo;
    const pdaBalances = data?.pdaBalances;

    return (
        <div className="section">
            <h2>Revenue Engine Dashboard</h2>
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            {isLoading && !data && <p>Loading initial data...</p>}
            <div className="grid">
                <InfoCard title="Revenue Safe ($HAiO)" description="Net revenue pending distribution" value={pdaBalances?.revenueSafe || 'N/A'} unit="HAiO" />
                <InfoCard title="Reward Pool ($HAiO)" description="Staker reward deposit pool" value={pdaBalances?.rewardPool || 'N/A'} unit="HAiO" />
                <InfoCard title="DAO Treasury ($HAiO)" description="DAO operation budget" value={pdaBalances?.dao || 'N/A'} unit="HAiO" />
                <InfoCard title="Developer Treasury ($HAiO)" description="Developer reward/incentive" value={pdaBalances?.dev || 'N/A'} unit="HAiO" />
                <InfoCard title="Total NFTs Staked" description="Current total staked NFTs" value={engineState ? engineState.totalStakedAmount.toString() : 'N/A'} />
                <InfoCard title="Last Distribution" description="Last distribution time" value={engineState ? (engineState.lastDistributionTimestamp > 0 ? new Date(Number(engineState.lastDistributionTimestamp) * 1000).toLocaleString() : 'Never') : 'N/A'} /> {/* BN -> Number conversion */}
            </div>
            <button onClick={refetch} disabled={isLoading}>Refresh Dashboard Data</button>
        </div>
    );
};
export default GlobalDashboardPage;