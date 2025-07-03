import { useState, useEffect, useCallback, useMemo } from 'react'; // useMemo added
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, getAccount, unpackAccount } from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
// Modified: Removed PublicKey creation functions from lib/solana, only import constants/Provider/Program creation functions
import {
    getAnchorProvider,
    getRevenueEngineProgram,
    getStakingProgram,
    HAIO_DECIMALS,
    USDC_DECIMALS,
    PRECISION,
    // Program ID getter function also not needed (only provider needed for Program creation)
} from '../lib/solana.ts';
import { formatTokenAmount } from '../lib/utils.ts';


export interface SolanaData {
    userHaioBalance: string;
    userUsdcBalance: string;
    userNfts: PublicKey[];
    revenueEngineInfo: any | null;
    myStakeInfo: any | null;
    isStaked: boolean;
    claimableReward: string;
    pdaBalances: {
        revenueSafe: string;
        rewardPool: string;
        dao: string;
        dev: string;
    };
}

export const useSolanaDataPolling = (intervalMs: number = 10000) => {
    const { connection } = useConnection();
    const { publicKey, wallet } = useWallet();
    const [data, setData] = useState<SolanaData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const provider = useMemo(() => getAnchorProvider(connection, wallet), [connection, wallet]);
    const revenueEngineProgram = useMemo(() => provider ? getRevenueEngineProgram(provider) : null, [provider]);
    const stakingProgram = useMemo(() => provider ? getStakingProgram(provider) : null, [provider]);

    // --- Create PublicKey objects inside hook using useMemo ---
    const revenueEnginePDA = useMemo(() => {
        const pda = process.env.REACT_APP_REVENUE_ENGINE_PDA;
        if (!pda) { console.error("Missing REACT_APP_REVENUE_ENGINE_PDA env var"); return null; }
        try { return new PublicKey(pda); } catch (e) { console.error("Invalid REVENUE_ENGINE_PDA:", e); return null; }
    }, []); // Empty array: create only once on component mount

    const haioMint = useMemo(() => {
        const mint = process.env.REACT_APP_HAIO_MINT_ADDRESS;
        if (!mint) { console.error("Missing REACT_APP_HAIO_MINT_ADDRESS env var"); return null; }
         try { return new PublicKey(mint); } catch (e) { console.error("Invalid HAIO_MINT_ADDRESS:", e); return null; }
    }, []);

    const usdcMint = useMemo(() => {
        const mint = process.env.REACT_APP_USDC_MINT_ADDRESS;
        if (!mint) { console.error("Missing REACT_APP_USDC_MINT_ADDRESS env var"); return null; }
         try { return new PublicKey(mint); } catch (e) { console.error("Invalid USDC_MINT_ADDRESS:", e); return null; }
    }, []);

    const demoNftMint = useMemo(() => {
        const mint = process.env.REACT_APP_DEMO_NFT_MINT_ADDRESS;
        if (!mint) { console.error("Missing REACT_APP_DEMO_NFT_MINT_ADDRESS env var"); return null; }
         try { return new PublicKey(mint); } catch (e) { console.error("Invalid DEMO_NFT_MINT_ADDRESS:", e); return null; }
    }, []);

    const rewardPoolATA = useMemo(() => {
        const ata = process.env.REACT_APP_REWARD_POOL_ATA;
        if (!ata) { console.error("Missing REACT_APP_REWARD_POOL_ATA env var"); return null; }
         try { return new PublicKey(ata); } catch (e) { console.error("Invalid REWARD_POOL_ATA:", e); return null; }
    }, []);

    const daoTreasuryPDA = useMemo(() => {
        const pda = process.env.REACT_APP_DAO_TREASURY_ATA;
        if (!pda) { console.error("Missing REACT_APP_DAO_TREASURY_PDA env var"); return null; }
         try { return new PublicKey(pda); } catch (e) { console.error("Invalid DAO_TREASURY_PDA:", e); return null; }
    }, []);

    const devTreasuryPDA = useMemo(() => {
        const pda = process.env.REACT_APP_DEVELOPER_TREASURY_ATA;
        if (!pda) { console.error("Missing REACT_APP_DEVELOPER_TREASURY_PDA env var"); return null; }
         try { return new PublicKey(pda); } catch (e) { console.error("Invalid DEVELOPER_TREASURY_PDA:", e); return null; }
    }, []);

    const revenueSafeATA = useMemo(() => {
        const ata = process.env.REACT_APP_REVENUE_SAFE_ATA;
        if (!ata) { console.error("Missing REACT_APP_REVENUE_SAFE_ATA env var"); return null; }
         try { return new PublicKey(ata); } catch (e) { console.error("Invalid REVENUE_SAFE_ATA:", e); return null; }
    }, []);


    const fetchData = useCallback(async () => {
        // --- Now PublicKey objects can be null, so check before use ---
        if (!publicKey || !connection || !revenueEngineProgram || !stakingProgram || !provider ||
            !revenueEnginePDA || !haioMint || !usdcMint || !demoNftMint || !rewardPoolATA ||
            !daoTreasuryPDA || !devTreasuryPDA || !revenueSafeATA) // Check all required Pubkeys
        {
            // console.warn("Polling dependencies not ready"); // May log too frequently
            return;
        }
        // setIsLoading(true);
        setError(null);
        console.log("--- [useSolanaDataPolling] Starting Data Fetch ---"); // Start log

        let fetchedRevenueEngine: any = null;
        let fetchedStakeData: any = null;
        let calculatedReward = "0.00";
        let currentlyStaked = false;
        let userNftOwned = false;

        try {
            // 1. Load EngineState
            try {
                console.log("Fetching EngineState from:", revenueEnginePDA.toBase58());
                fetchedRevenueEngine = await revenueEngineProgram.account.engineState.fetch(revenueEnginePDA);
                console.log("EngineState Fetched:", fetchedRevenueEngine);

            } catch (e) { console.warn("Could not fetch EngineState:", e); fetchedRevenueEngine = null; }

            // 2. Check user balance and NFT ownership
            console.log("Fetching user balances and NFT status for:", publicKey.toBase58());

             const [userHaioAtaAddress, userUsdcAtaAddress, userNftAtaAddress] = await Promise.all([
                 getAssociatedTokenAddress(haioMint, publicKey), // Use variable
                 getAssociatedTokenAddress(usdcMint, publicKey), // Use variable
                 getAssociatedTokenAddress(demoNftMint, publicKey) // Use variable
             ]);
             // ... (remaining balance and ownership check logic same) ...
             const [haioBalInfo, usdcBalInfo, nftAccountInfo] = await Promise.allSettled([
                 connection.getAccountInfo(userHaioAtaAddress),
                 connection.getAccountInfo(userUsdcAtaAddress),
                 connection.getAccountInfo(userNftAtaAddress)
             ]);
             const userHaioBalanceStr = (haioBalInfo.status === 'fulfilled' && haioBalInfo.value) ? formatTokenAmount(unpackAccount(userHaioAtaAddress, haioBalInfo.value).amount, HAIO_DECIMALS) : "0.00";
             const userUsdcBalanceStr = (usdcBalInfo.status === 'fulfilled' && usdcBalInfo.value) ? formatTokenAmount(unpackAccount(userUsdcAtaAddress, usdcBalInfo.value).amount, USDC_DECIMALS) : "0.00";
             if (nftAccountInfo.status === 'fulfilled' && nftAccountInfo.value) {
                 userNftOwned = unpackAccount(userNftAtaAddress, nftAccountInfo.value).amount > BigInt(0);
             }
             console.log(`User Balances: HAiO=${userHaioBalanceStr}, USDC=${userUsdcBalanceStr}, OwnsNFT=${userNftOwned}`);


            // 3. Load my staking information
            const [nftStakePDA, _] = PublicKey.findProgramAddressSync(
                [Buffer.from("nft_stake"), publicKey.toBuffer(), demoNftMint.toBuffer()], // Use variable
                stakingProgram.programId
            );
            console.log("Fetching NftStakeState from:", nftStakePDA.toBase58());

            try {
                fetchedStakeData = await stakingProgram.account.nftStakeState.fetch(nftStakePDA);
                currentlyStaked = fetchedStakeData.isStaked;
                console.log("NftStakeState Fetched:", fetchedStakeData);

            } catch (e) { fetchedStakeData = null; }

            // 4. Calculate claimable rewards (same)
            if (currentlyStaked && fetchedRevenueEngine && fetchedStakeData) {
                // ... calculation logic ...
                const currentCumulative = fetchedRevenueEngine.rewardPerTokenCumulative as anchor.BN;
                const lastDebt = fetchedStakeData.rewardDebt as anchor.BN;
                const stakedAmount = fetchedStakeData.stakedAmount as anchor.BN;
                if (currentCumulative.gt(lastDebt)) {
                    const diff = currentCumulative.sub(lastDebt);
                    const reward = diff.mul(stakedAmount).div(PRECISION);
                    calculatedReward = formatTokenAmount(reward, HAIO_DECIMALS);
                }
            }

            // 5. Load PDA balances (add step-by-step logging)
            console.log("Fetching PDA balances...");
            const pdaAddresses = {
                revenueSafe: revenueSafeATA,
                rewardPool: rewardPoolATA,
                dao: daoTreasuryPDA,
                dev: devTreasuryPDA
            };
            let pdaBalancesData = { revenueSafe: "0.00", rewardPool: "0.00", dao: "0.00", dev: "0.00" };

            try {
                console.log(" Fetching Revenue Safe balance from:", pdaAddresses.revenueSafe.toBase58());
                const safeInfo = await getAccount(connection, pdaAddresses.revenueSafe).catch(() => null);
                pdaBalancesData.revenueSafe = safeInfo ? formatTokenAmount(safeInfo.amount, HAIO_DECIMALS) : "0.00";
                console.log(`  Revenue Safe Balance: ${pdaBalancesData.revenueSafe}`);

                console.log(" Fetching Reward Pool balance from:", pdaAddresses.rewardPool.toBase58());
                const poolInfo = await getAccount(connection, pdaAddresses.rewardPool).catch(() => null);
                pdaBalancesData.rewardPool = poolInfo ? formatTokenAmount(poolInfo.amount, HAIO_DECIMALS) : "0.00";
                 console.log(`  Reward Pool Balance: ${pdaBalancesData.rewardPool}`);

                console.log(" Fetching DAO Treasury balance from:", pdaAddresses.dao.toBase58());
                const daoInfo = await getAccount(connection, pdaAddresses.dao).catch(() => null);
                pdaBalancesData.dao = daoInfo ? formatTokenAmount(daoInfo.amount, HAIO_DECIMALS) : "0.00";
                 console.log(`  DAO Treasury Balance: ${pdaBalancesData.dao}`); // Add log

                console.log(" Fetching Dev Treasury balance from:", pdaAddresses.dev.toBase58());
                const devInfo = await getAccount(connection, pdaAddresses.dev).catch(() => null);
                pdaBalancesData.dev = devInfo ? formatTokenAmount(devInfo.amount, HAIO_DECIMALS) : "0.00";
                 console.log(`  Dev Treasury Balance: ${pdaBalancesData.dev}`); // Add log

            } catch (pdaError) {
                console.error("Error fetching PDA balances:", pdaError);
                setError("Failed to fetch PDA balances.");
            }



            // Create final data object (same)
            const newData: SolanaData = {
                userHaioBalance: userHaioBalanceStr,
                userUsdcBalance: userUsdcBalanceStr,
                userNfts: userNftOwned ? [demoNftMint] : [], // Use variable
                revenueEngineInfo: fetchedRevenueEngine,
                myStakeInfo: fetchedStakeData,
                isStaked: currentlyStaked,
                claimableReward: calculatedReward,
                pdaBalances: pdaBalancesData,
            };

            setData(newData);
            console.log("--- [useSolanaDataPolling] Data Fetch Complete ---", newData); // Final data log

        } catch (error: any) {
            console.error("Error in Solana data polling:", error);
            setError(`Data polling failed: ${error.message}`);
        } finally {
            // setIsLoading(false); // Remove loading during polling
        }
    // --- Add created PublicKey variables to dependency array ---
    }, [publicKey, connection, revenueEngineProgram, stakingProgram, provider,
        revenueEnginePDA, haioMint, usdcMint, demoNftMint, rewardPoolATA,
        daoTreasuryPDA, devTreasuryPDA, revenueSafeATA]);

    // Polling setup (same)
    useEffect(() => {
        if (publicKey && connection) {
            fetchData();
            const intervalId = setInterval(fetchData, intervalMs);
            return () => clearInterval(intervalId);
        } else {
            setData(null);
        }
    }, [publicKey, connection, fetchData, intervalMs]);

    return { data, isLoading, error, refetch: fetchData };
};