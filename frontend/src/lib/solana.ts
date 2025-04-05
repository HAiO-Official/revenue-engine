import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import { Connection, PublicKey, Cluster } from '@solana/web3.js';

// IDL 및 타입 임포트
import revenueEngineIdl from '../idl/revenue_engine.json';
import stakingIdl from '../idl/staking_program.json';
import mockSwapIdl from '../idl/mock_swap_program.json';
import { RevenueEngine } from '../types/revenue_engine';
import { StakingProgram } from '../types/staking_program';
import { MockSwapProgram } from '../types/mock_swap_program';

// --- PublicKey 생성을 함수 내부로 이동 ---

// 프로그램 ID 가져오기 함수
export const getRevenueEngineProgramId = (): PublicKey => {
    const programId = process.env.REACT_APP_REVENUE_ENGINE_PROGRAM_ID;
    if (!programId) throw new Error("Missing REACT_APP_REVENUE_ENGINE_PROGRAM_ID env var");
    return new PublicKey(programId);
};

export const getStakingProgramId = (): PublicKey => {
    const programId = process.env.REACT_APP_STAKING_PROGRAM_ID;
    if (!programId) throw new Error("Missing REACT_APP_STAKING_PROGRAM_ID env var");
    return new PublicKey(programId);
};

export const getMockSwapProgramId = (): PublicKey => {
    const programId = process.env.REACT_APP_MOCK_SWAP_PROGRAM_ID;
    if (!programId) throw new Error("Missing REACT_APP_MOCK_SWAP_PROGRAM_ID env var");
    return new PublicKey(programId);
};

// 주요 계정 주소 가져오기 함수 (필요한 것들만 추가)
export const getRevenueEnginePDA = (): PublicKey => {
    const pda = process.env.REACT_APP_REVENUE_ENGINE_PDA;
    if (!pda) throw new Error("Missing REACT_APP_REVENUE_ENGINE_PDA env var");
    return new PublicKey(pda);
};

export const getRewardPoolATA = (): PublicKey => {
    const ata = process.env.REACT_APP_REWARD_POOL_ATA;
    if (!ata) throw new Error("Missing REACT_APP_REWARD_POOL_ATA env var");
    return new PublicKey(ata);
};

export const getDaoTreasuryPDA = (): PublicKey => {
    const pda = process.env.REACT_APP_DAO_TREASURY_ATA;
    if (!pda) throw new Error("Missing REACT_APP_DAO_TREASURY_PDA env var");
    return new PublicKey(pda);
};

export const getDevTreasuryPDA = (): PublicKey => {
    const pda = process.env.REACT_APP_DEVELOPER_TREASURY_ATA;
    if (!pda) throw new Error("Missing REACT_APP_DEVELOPER_TREASURY_PDA env var");
    return new PublicKey(pda);
};

export const getOpWalletAddress = (): PublicKey => {
    const address = process.env.REACT_APP_OP_WALLET_ADDRESS;
    if (!address) throw new Error("Missing REACT_APP_OP_WALLET_ADDRESS env var");
    return new PublicKey(address);
};

export const getRevenueSafeATA = (): PublicKey => {
    const ata = process.env.REACT_APP_REVENUE_SAFE_ATA;
    if (!ata) throw new Error("Missing REACT_APP_REVENUE_SAFE_ATA env var");
    return new PublicKey(ata);
};

export const getDemoNftMint = (): PublicKey => {
    const mint = process.env.REACT_APP_DEMO_NFT_MINT_ADDRESS;
    if (!mint) throw new Error("Missing REACT_APP_DEMO_NFT_MINT_ADDRESS env var");
    return new PublicKey(mint);
};

export const getHaioMint = (): PublicKey => {
    const mint = process.env.REACT_APP_HAIO_MINT_ADDRESS;
    if (!mint) throw new Error("Missing REACT_APP_HAIO_MINT_ADDRESS env var");
    return new PublicKey(mint);
};

export const getUsdcMint = (): PublicKey => {
    const mint = process.env.REACT_APP_USDC_MINT_ADDRESS;
    if (!mint) throw new Error("Missing REACT_APP_USDC_MINT_ADDRESS env var");
    return new PublicKey(mint);
};


// Anchor Provider 생성 함수 (동일)
export const getAnchorProvider = (connection: Connection, wallet: any): AnchorProvider | null => {
    if (!wallet?.adapter) return null;
    // @ts-ignore
    return new AnchorProvider(connection, wallet.adapter, { commitment: 'confirmed' });
};

// 프로그램 인스턴스 생성 함수 (프로그램 ID를 인자로 받도록 수정)
export const getRevenueEngineProgram = (provider: AnchorProvider): Program<RevenueEngine> => {
    return new Program<RevenueEngine>(revenueEngineIdl as any, provider); // ID 함수 호출
};

export const getStakingProgram = (provider: AnchorProvider): Program<StakingProgram> => {
    return new Program<StakingProgram>(stakingIdl as any, provider); // ID 함수 호출
};

export const getMockSwapProgram = (provider: AnchorProvider): Program<MockSwapProgram> => {
    return new Program<MockSwapProgram>(mockSwapIdl as any, provider); // ID 함수 호출
};

// 기타 Solana 관련 유틸리티 (상수 정의)
export const HAIO_DECIMALS = 9;
export const USDC_DECIMALS = 6;
export const ATH_DECIMALS = 9;
export const PRECISION = new BN("1000000000000"); // 10^12