import React, { useMemo } from 'react';
import '../App.css';
import { useApiPolling } from '../hooks/useApiPolling.ts';
import InfoCard from '../components/ui/InfoCard.tsx';
import LogViewer from '../components/ui/LogViewer.tsx';
import { HAIO_DECIMALS, USDC_DECIMALS, ATH_DECIMALS } from '../lib/solana.ts';
import { formatTokenAmount } from '../lib/utils.ts';

const AgentMonitorPage = () => {
    // 훅에서 직접 포맷된 로그(HTML 문자열 배열)를 받음
    const { logs: formattedLogs, status, isLoading, error, refetch } = useApiPolling(3000);

    const opHaioBalanceDisplay = status?.op_haio_balance !== undefined ? formatTokenAmount(status.op_haio_balance * (10**HAIO_DECIMALS), HAIO_DECIMALS) : 'N/A';
    const opUsdcBalanceDisplay = status?.op_usdc_balance !== undefined ? formatTokenAmount(status.op_usdc_balance * (10**USDC_DECIMALS), USDC_DECIMALS) : 'N/A';
    const opAthBalanceDisplay = status?.op_ath_balance !== undefined ? formatTokenAmount(status.op_ath_balance * (10**ATH_DECIMALS), ATH_DECIMALS) : 'N/A';

    return (
        <div className="section">
            <h2>Agent Activity Monitor</h2>
            {error && <p style={{ color: 'red' }}>Error: {error}</p>}
            {isLoading && <p>Loading agent data...</p>}
            <div className="grid">
                <InfoCard title="Agent Status" description="Current agent task status" value={status?.status || 'N/A'} />
                <InfoCard title="Current Step" description="Current processing step" value={status?.current_step || 'N/A'} />
                <InfoCard title="Agent Wallet ($HAiO)" description="Agent wallet balance" value={opHaioBalanceDisplay} unit="HAiO" />
                <InfoCard title="Agent Wallet (USDC)" description="Agent wallet balance" value={opUsdcBalanceDisplay} unit="USDC" />
                <InfoCard title="Agent Wallet (ATH)" description="Agent wallet balance" value={opAthBalanceDisplay} unit="ATH" />
            </div>
            <div className="section logs" style={{ marginTop: '20px' }}>
                <h3>Real-time Agent Logs</h3>
                {/* LogViewer는 포맷된 HTML 로그 배열을 그대로 받음 */}
                <LogViewer logs={formattedLogs} />
            </div>
            <button onClick={refetch} disabled={isLoading}>Refresh Agent Data</button>
        </div>
    );
};
export default AgentMonitorPage;
