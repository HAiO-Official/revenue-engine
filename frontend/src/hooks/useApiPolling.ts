import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "http://localhost:3001";

export interface AgentLog {
    timestamp: string; // ISO 8601 format
    message: string;
    status: 'info' | 'success' | 'error' | 'process';
    tx_id?: string;
}

export interface AgentStatus {
    status: 'IDLE' | 'PROCESSING' | 'ERROR' | string; // 더 구체적인 상태 추가 가능
    current_step?: 'SWAPPING' | 'BURNING' | 'TRANSFERRING' | 'DISTRIBUTING' | string; // 현재 단계
    op_usdc_balance: number; 
    op_haio_balance: number;
    op_ath_balance: number;
}

function formatLogEntry(log: AgentLog): string {
    const timestamp = new Date(log.timestamp).toLocaleTimeString();
    const icon = log.status === 'success' ? '✅' : log.status === 'process' ? '⏳' : log.status === 'error' ? '❌' : 'ℹ️';
    const iconClass = `status-${log.status || 'info'}`;
    const txLink = (log.tx_id && log.tx_id.trim() !== '')
        ? ` <a href="https://explorer.solana.com/tx/${log.tx_id}?cluster=devnet" target="_blank" rel="noopener noreferrer" class="tx-link">View Tx (${log.tx_id.substring(0, 4)}...)</a>`
        : ''; 
    return `<div class="log-entry"><span class="log-icon ${iconClass}">${icon}</span><span class="log-time">[${timestamp}]</span><span class="log-message">${log.message}</span>${txLink}</div>`; 
}



export const useApiPolling = (intervalMs: number = 3000) => {
    const [formattedLogs, setFormattedLogs] = useState<string[]>(["<div class='log-entry'><span class='log-icon status-info'>ℹ️</span><span class='log-time'>[Initial]</span><span class='log-message'>Waiting for first API poll...</span></div>"]);
    const [status, setStatus] = useState<AgentStatus | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setError(null);
        try {
            const [statusRes, logsRes] = await Promise.allSettled([
                axios.get<AgentStatus>(`${apiBaseUrl}/api/agent-status`),
                axios.get<AgentLog[]>(`${apiBaseUrl}/api/agent-logs?limit=50`) // API가 최신순 정렬 가정
            ]);

            if (statusRes.status === 'fulfilled') {
                console.log(`statusRes.value.data: ${JSON.stringify(statusRes.value.data)}`);
                setStatus(statusRes.value.data);
            } else {
                console.warn("Failed to fetch agent status:", statusRes);
                setError("Failed to fetch agent status.");
            }

            if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value.data)) {
                // API 응답(AgentLog[])을 받아서 HTML 문자열 배열로 변환
                const newFormattedLogs = logsRes.value.data.map(formatLogEntry);
                setFormattedLogs(newFormattedLogs); // 상태 업데이트
            } else {
                console.warn("Failed to fetch agent logs:", logsRes);
                setError(prev => prev ? `${prev} & Failed to fetch logs.` : "Failed to fetch logs.");
            }

        } catch (apiError: any) {
            console.error("API polling error:", apiError);
            setError(`API polling error: ${apiError.message}`);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const intervalId = setInterval(fetchData, intervalMs);
        return () => clearInterval(intervalId);
    }, [fetchData, intervalMs]);

    return { logs: formattedLogs, status, isLoading, error, refetch: fetchData };
};
