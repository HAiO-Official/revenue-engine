import React, { useState, useEffect, useCallback, useMemo } from 'react';
import '../App.css';

// Solana & Anchor Imports
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, getAccount, createTransferInstruction, unpackAccount, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

// Hooks, Libs, Components imports
import { useSolanaDataPolling, SolanaData } from '../hooks/useSolanaDataPolling.ts';
// Modified: Import all required functions/constants
import {
    getAnchorProvider,
    getStakingProgram,
    getRevenueEngineProgram,
    getRevenueEnginePDA,
    getRewardPoolATA,
    getHaioMint,
    getUsdcMint, // Added
    getDemoNftMint,
    getOpWalletAddress, // Added
    getStakingProgramId, // Added
    getRevenueEngineProgramId, // Added
    HAIO_DECIMALS,
    USDC_DECIMALS,
    PRECISION
} from '../lib/solana.ts';
import { formatTokenAmount } from '../lib/utils.ts';
import InfoCard from '../components/ui/InfoCard.tsx';
import LogViewer from '../components/ui/LogViewer.tsx';
import axios from 'axios';

const StakingClaimPage = () => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction, signTransaction, wallet } = useWallet();
    const [logs, setLogs] = useState<string[]>(["Initialize Staking Page..."]);
    const [isLoading, setIsLoading] = useState(false);
    const [usdcAmountToSend, setUsdcAmountToSend] = useState<string>("50");
    const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || "http://localhost:3001";
    // Use Solana data polling hook
    const { data: solanaData, isLoading: _isDataLoading, error: _dataError, refetch: refetchData } = useSolanaDataPolling(10000);

    // Log update function (same)
    const updateLogs = useCallback((newLog: string, status: 'info' | 'success' | 'error' | 'process' = 'info', txId?: string) => {
        const timestamp = new Date().toLocaleTimeString();
        let icon = 'ℹ️';
        if (status === 'success') icon = '✅';
        else if (status === 'process') icon = '⏳';
        else if (status === 'error') icon = '❌';
        const logMessage = `<div class="log-entry"><span class="log-icon status-${status}">${icon}</span><span class="log-time">[${timestamp}]</span><span class="log-message">${newLog}</span>${txId ? ` <a href="https://explorer.solana.com/tx/${txId}?cluster=devnet" target="_blank" rel="noopener noreferrer" class="tx-link">View Tx</a>` : ''}</div>`;
        setLogs(prevLogs => [logMessage, ...prevLogs.slice(0, 99)]);
    }, []);

    // Anchor Provider and program instances (same)
    const provider = useMemo(() => getAnchorProvider(connection, wallet), [connection, wallet]);
    const stakingProgram = useMemo(() => provider ? getStakingProgram(provider) : null, [provider]);
    const revenueEngineProgram = useMemo(() => provider ? getRevenueEngineProgram(provider) : null, [provider]);

     // Derived state (for UI display)
     const userHaioBalance = solanaData?.userHaioBalance ?? "0.00";
     const userUsdcBalance = solanaData?.userUsdcBalance ?? "0.00";
     const userNfts = solanaData?.userNfts ?? [];
     const isStaked = solanaData?.isStaked ?? false;
     const claimableReward = solanaData?.claimableReward ?? "0.00";
     const myStakeInfo = solanaData?.myStakeInfo;


    // --- Button handlers (modified to call Pubkey functions) ---
    const handleStake = useCallback(async () => {
        const currentNfts = solanaData?.userNfts ?? [];
        // Check program and key loading
        if (!publicKey || isLoading || isStaked || currentNfts.length === 0 || !stakingProgram || !provider || !revenueEngineProgram) return;
        // Call required Pubkey functions
        const demoNftMintAddr = getDemoNftMint();
        const revenueEnginePDAAddr = getRevenueEnginePDA();
        const stakingProgramIdVal = getStakingProgramId();
        const revenueEngineProgramIdVal = getRevenueEngineProgramId();

        updateLogs(`Staking NFT ${demoNftMintAddr.toBase58().substring(0,6)}...`, 'process');
        setIsLoading(true);
        try {
            const [nftStakePDA, _stakeBump] = PublicKey.findProgramAddressSync(
                [Buffer.from("nft_stake"), publicKey.toBuffer(), demoNftMintAddr.toBuffer()],
                stakingProgramIdVal // Use variable
            );
            const accounts = {
                userWallet: publicKey,
                nftMint: demoNftMintAddr, // Use variable
                engineState: revenueEnginePDAAddr, // Use variable
                revenueEngineProgram: revenueEngineProgramIdVal, // Use variable
                nftStakeState: nftStakePDA,
                stakingProgramExecutable: stakingProgramIdVal, // Use variable
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: TOKEN_PROGRAM_ID,
            };
            console.log("Stake Accounts:", accounts);
            const txSignature = await stakingProgram.methods
                .stake()
                .accounts(accounts)
                .rpc({ commitment: 'confirmed' });
            updateLogs("Stake successful!", 'success', txSignature);
            await connection.confirmTransaction(txSignature, 'confirmed');
            await refetchData();
        } catch (error: any) {
            console.error("Stake failed:", error);
            updateLogs(`Stake failed: ${error.message || error.toString()}`, 'error');
            if (error instanceof Error && 'logs' in error) console.error("Logs:", (error as any).logs);
        } finally { setIsLoading(false); }
    }, [publicKey, isLoading, isStaked, solanaData, stakingProgram, provider, connection, refetchData, updateLogs, revenueEngineProgram]); // Added solanaData

    const handleUnstake = useCallback(async () => {
        // Check program and key loading
        if (!publicKey || isLoading || !isStaked || !stakingProgram || !provider || !revenueEngineProgram || !sendTransaction || !myStakeInfo) return;
        // Call required Pubkey functions
        const demoNftMintAddr = getDemoNftMint();
        const revenueEnginePDAAddr = getRevenueEnginePDA();
        const haioMintAddr = getHaioMint();
        const rewardPoolAtaAddr = getRewardPoolATA();
        const stakingProgramIdVal = getStakingProgramId();
        const revenueEngineProgramIdVal = getRevenueEngineProgramId();

        updateLogs(`Unstaking demo NFT...`, 'process');
        setIsLoading(true);
        const transaction = new Transaction();
        try {
            const nftToUnstake = new PublicKey(myStakeInfo.nftMint);
            const [nftStakePDA, _1] = PublicKey.findProgramAddressSync(
                [Buffer.from("nft_stake"), publicKey.toBuffer(), nftToUnstake.toBuffer()],
                stakingProgramIdVal // Use variable
            );
            const [rewardPoolAuthorityPDA, _2] = PublicKey.findProgramAddressSync(
                [Buffer.from("reward_pool_authority_seed")],
                stakingProgramIdVal // Use variable
            );
            const userHaioAta = await getAssociatedTokenAddress(haioMintAddr, publicKey);
            try { await getAccount(connection, userHaioAta); } catch {
                transaction.add(createAssociatedTokenAccountInstruction(publicKey, userHaioAta, publicKey, haioMintAddr));
            }
            const accounts = {
                userWallet: publicKey,
                nftMint: nftToUnstake,
                userHaioAccount: userHaioAta,
                engineState: revenueEnginePDAAddr, // Use variable
                revenueEngineProgram: revenueEngineProgramIdVal, // Use variable
                nftStakeState: nftStakePDA,
                rewardPoolPda: rewardPoolAtaAddr, // Use variable
                rewardPoolAuthority: rewardPoolAuthorityPDA,
                stakingProgramExecutable: stakingProgramIdVal, // Use variable
                tokenProgram: TOKEN_PROGRAM_ID,
                engineStateLoader: revenueEnginePDAAddr, // Use variable
            };
            transaction.add(
                await stakingProgram.methods
                    .unstake()
                    .accounts(accounts)
                    .instruction()
            );
            const txSignature = await sendTransaction(transaction, connection);
            updateLogs("Unstake successful! Rewards claimed.", 'success', txSignature);
            await connection.confirmTransaction(txSignature, 'confirmed');
            await refetchData();
        } catch (error: any) {
            console.error("Unstake failed:", error);
            updateLogs(`Unstake failed: ${error.message || error.toString()}`, 'error');
            if (error instanceof Error && 'logs' in error) console.error("Logs:", (error as any).logs);
        } finally { setIsLoading(false); }
    }, [publicKey, isLoading, isStaked, myStakeInfo, stakingProgram, provider, connection, refetchData, updateLogs, sendTransaction, revenueEngineProgram]);

    const handleClaim = useCallback(async () => {
        // Check program and key loading
        if (!publicKey || isLoading || !isStaked || parseFloat(claimableReward) <= 0 || !stakingProgram || !provider || !revenueEngineProgram || !signTransaction || !myStakeInfo) return;
        // Call required Pubkey functions
        const haioMintAddr = getHaioMint();
        const revenueEnginePDAAddr = getRevenueEnginePDA();
        const rewardPoolAtaAddr = getRewardPoolATA();
        const stakingProgramIdVal = getStakingProgramId();

        updateLogs(`Claiming ${claimableReward} $HAiO rewards...`, 'process');
        setIsLoading(true);
        const transaction = new Transaction();
        try {
            const nftMint = new PublicKey(myStakeInfo.nftMint);
            const [nftStakePDA, _1] = PublicKey.findProgramAddressSync(
                [Buffer.from("nft_stake"), publicKey.toBuffer(), nftMint.toBuffer()],
                stakingProgramIdVal // Use variable
            );
            const [rewardPoolAuthorityPDA, _2] = PublicKey.findProgramAddressSync(
                [Buffer.from("reward_pool_authority_seed")],
                stakingProgramIdVal // Use variable
            );
            const userHaioAta = await getAssociatedTokenAddress(haioMintAddr, publicKey);
            try { await getAccount(connection, userHaioAta); } catch {
                transaction.add(createAssociatedTokenAccountInstruction(publicKey, userHaioAta, publicKey, haioMintAddr));
            }
            const accounts = {
                userWallet: publicKey,
                userHaioAccount: userHaioAta,
                engineState: revenueEnginePDAAddr, // Use variable
                nftStakeState: nftStakePDA,
                rewardPoolPda: rewardPoolAtaAddr, // Use variable
                rewardPoolAuthority: rewardPoolAuthorityPDA,
                engineStateLoader: revenueEnginePDAAddr, // Use variable
                tokenProgram: TOKEN_PROGRAM_ID,
            };
            transaction.add(
                await stakingProgram.methods
                    .claimRewards()
                    .accounts(accounts)
                    .instruction()
            );
            transaction.feePayer = publicKey;
            transaction.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
            updateLogs('Requesting signature...', 'process');
            // @ts-ignore
            const signedTx = await signTransaction(transaction);
            updateLogs('Signature received. Sending raw transaction...', 'process');
            const txSignature = await connection.sendRawTransaction(signedTx.serialize());
            updateLogs("Claim successful!", 'success', txSignature);
            await connection.confirmTransaction(txSignature, 'confirmed');
            await refetchData();
        } catch (error: any) {
            console.error("Claim failed:", error);
            updateLogs(`Claim failed: ${error.message || error.toString()}`, 'error');
            if (error.logs) console.error("Logs:", error.logs);
        } finally { setIsLoading(false); }
    }, [publicKey, isLoading, isStaked, claimableReward, myStakeInfo, stakingProgram, provider, connection, refetchData, updateLogs, revenueEngineProgram, signTransaction]);

    const handleSimulateRevenue = useCallback(async () => {
        // Only check wallet connection (USDC balance not required)
        if (!publicKey || isLoading) return alert("Wallet not connected or processing.");
        const amountInput = document.getElementById('usdcAmount') as HTMLInputElement;
        const amountDecimal = parseFloat(amountInput.value); // Convert input value to number
        if (isNaN(amountDecimal) || amountDecimal <= 0) return alert("Enter valid USDC amount.");

        // Convert input value to Lamports units
        const amountLamports = BigInt(Math.round(amountDecimal * (10**USDC_DECIMALS)));

        updateLogs(`Requesting revenue simulation (${amountDecimal} USDC) via API...`, 'process');
        setIsLoading(true);
        try {
            // Backend API call
            const response = await axios.post(`${apiBaseUrl}/api/simulate-and-run`, {
                amountLamports: amountLamports.toString() // Convert BigInt to string as it's difficult to send directly as JSON
            });

            if (response.data?.success) {
                updateLogs(`API: ${response.data.message}`, 'success', response.data.transferTxId);
                // After successful API call, guide to check progress on Agent Monitor page
                updateLogs("Check Agent Monitor page for processing details.", 'info');
                // No need to call loadData here (Agent changes state after processing)
            } else {
                throw new Error(response.data?.message || "API request failed");
            }

        } catch (error: any) {
            console.error("Simulate Revenue API call failed:", error);
            updateLogs(`Simulate Revenue failed: ${error.response?.data?.message || error.message || error.toString()}`, 'error');
        } finally {
            setIsLoading(false);
        }
    // Simplify dependencies
    }, [publicKey, isLoading, usdcAmountToSend, updateLogs]);

    const handleTriggerWorkerInfo = () => {
        updateLogs("Manual Trigger Info: The Agent Worker process runs separately in the background.", 'info');
        updateLogs("It monitors the Operational Wallet and starts processing automatically when USDC arrives.", 'info');
        alert("This button is for information only. Ensure the agent worker script is running.");
    };

    // --- UI Rendering (same) ---
    return (
        <div>
            {isLoading && <div className="loading-overlay"><p>Processing...</p></div>}

            <div className="section wallet-status">
                <h2>Your Wallet & NFT</h2>
                <div style={{ marginBottom: '15px' }}> <WalletMultiButton /> </div>
                <p>Wallet: <span className="value">{publicKey ? `${publicKey.toBase58().substring(0, 6)}...${publicKey.toBase58().substring(publicKey.toBase58().length - 6)}` : 'Not Connected'}</span></p>
                <div className="grid">
                    <InfoCard title="Your $HAiO" description="(My wallet balance)" value={userHaioBalance} unit="HAiO" />
                    <InfoCard title="Your MockUSDC" description="(My wallet balance)" value={userUsdcBalance} unit="USDC" />
                    {/* Modified: demoNftMint() call */}
                    <InfoCard title="Demo Agent NFT" description="(For testing demonstration)" value={userNfts.length > 0 ? `${getDemoNftMint().toBase58().substring(0,6)}... (${isStaked ? 'Staked' : 'Available'})` : 'Not Found'} />
                </div>
            </div>

            <div className="section staking">
                <h2>NFT Staking & Rewards</h2>
                <div className="grid">
                    <div className="card">
                        <h3>Staking Actions</h3>
                        <p className="description">Stake or unstake the demo NFT.</p>
                        <button onClick={handleStake} disabled={!publicKey || isLoading || isStaked || userNfts.length === 0}>Stake Demo NFT</button>
                        <button onClick={handleUnstake} disabled={!publicKey || isLoading || !isStaked}>Unstake Demo NFT</button>
                    </div>
                    <div className="card">
                        <h3>Claimable Rewards</h3>
                        <p className="description">Current claimable $HAiO rewards</p>
                        <p><span className="value">{claimableReward}</span><span className="unit">HAiO</span></p>
                        <button onClick={handleClaim} disabled={!publicKey || isLoading || parseFloat(claimableReward) <= 0}>Claim Rewards</button>
                    </div>
                </div>
            </div>

            <div className="section demo-controls">
                <h2>Demo Controls</h2>
                <label htmlFor="usdcAmount">USDC Amount:</label>
                <input type="text" id="usdcAmount" value={usdcAmountToSend} onChange={(e) => setUsdcAmountToSend(e.target.value)} />
                <button onClick={handleSimulateRevenue} disabled={!publicKey || isLoading}>1. Simulate Revenue</button>
                <span className="button-description">Simulates external revenue (USDC) arriving in the Agent's Wallet</span>
                <br style={{ marginBottom: '10px' }} />
                {/* <button onClick={handleTriggerWorkerInfo} disabled={isLoading} style={{ marginLeft: '0' }}>2. Trigger Agent Info</button> */}
                {/* <span className="button-description">Information about the automatic processing process of the Agent</span> */}
            </div>

            <div className="section logs">
                <h2>Activity Log</h2>
                <LogViewer logs={logs} />
            </div>
        </div>
    );
};

export default StakingClaimPage;