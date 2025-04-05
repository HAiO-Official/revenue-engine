import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, burn, transfer, getAssociatedTokenAddress, getAccount, Account, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';
import { Program, AnchorProvider, Wallet, Idl } from '@coral-xyz/anchor';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';

// DB 함수 임포트
import { addLog, updateStatus, initializeDatabase, getStatus } from './db'; // 경로 확인

// 타입 임포트
import { RevenueEngine } from './types/revenue_engine';
import { MockSwapProgram } from './types/mock_swap_program';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// --- 환경 변수 로드 및 검증 ---
const {
    RPC_URL, ADMIN_KEYPAIR_PATH, OPERATIONAL_WALLET_KEYPAIR_PATH,
    USDC_MINT_ADDRESS, HAIO_MINT_ADDRESS,
    REVENUE_ENGINE_PDA, REVENUE_SAFE_ATA,
    MOCK_USDC_VAULT_ATA, MOCK_HAIO_VAULT_ATA,
    USDC_THRESHOLD_LAMPORTS, CHECK_INTERVAL_MS, BURN_RATIO_BPS,
    ATH_MINT_ADDRESS,
    AETHIR_PAYMENT_WALLET_ADDRESS,
    ATH_PAYMENT_RATIO_BPS,
    MOCK_ATH_VAULT_ATA,
} = process.env;

const requiredEnvVars = [
    'RPC_URL', 'ADMIN_KEYPAIR_PATH', 'OPERATIONAL_WALLET_KEYPAIR_PATH',
    'USDC_MINT_ADDRESS', 'HAIO_MINT_ADDRESS', 'REVENUE_ENGINE_PDA',
    'REVENUE_SAFE_ATA', 'MOCK_USDC_VAULT_ATA', 'MOCK_HAIO_VAULT_ATA',
    'USDC_THRESHOLD_LAMPORTS', 'CHECK_INTERVAL_MS', 'BURN_RATIO_BPS',
    'ATH_MINT_ADDRESS', 'AETHIR_PAYMENT_WALLET_ADDRESS', 'ATH_PAYMENT_RATIO_BPS', 'MOCK_ATH_VAULT_ATA'
];
for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        console.error(`Error: Missing essential environment variable: ${varName}`);
        process.exit(1);
    }
}

// --- 상수 및 타입 변환 ---
const connection = new Connection(RPC_URL!, 'finalized');
const usdcMint = new PublicKey(USDC_MINT_ADDRESS!);
const haioMint = new PublicKey(HAIO_MINT_ADDRESS!);
const revenueEnginePda = new PublicKey(REVENUE_ENGINE_PDA!);
const revenueSafe = new PublicKey(REVENUE_SAFE_ATA!);
const mockUsdcVault = new PublicKey(MOCK_USDC_VAULT_ATA!);
const mockHaioVault = new PublicKey(MOCK_HAIO_VAULT_ATA!);
const usdcThreshold = BigInt(USDC_THRESHOLD_LAMPORTS!);
const checkInterval = parseInt(CHECK_INTERVAL_MS!);
const burnRatioBps = parseInt(BURN_RATIO_BPS!);
const athMint = new PublicKey(ATH_MINT_ADDRESS!);
const aethirPaymentWallet = new PublicKey(AETHIR_PAYMENT_WALLET_ADDRESS!);
const athPaymentRatioBps = parseInt(ATH_PAYMENT_RATIO_BPS!);
const mockAthVault = new PublicKey(MOCK_ATH_VAULT_ATA!);
const USDC_DECIMALS = 6;
const HAIO_DECIMALS = 9;
const ATH_DECIMALS = 9;

// --- 키페어 로드 ---
function loadKeypair(keypairPath: string): Keypair {
    try {
        const absolutePath = path.resolve(__dirname, '..', keypairPath);
        if (!fs.existsSync(absolutePath)) { throw new Error(`Keypair file not found at ${absolutePath}`); }
        const secretKey = Buffer.from(JSON.parse(fs.readFileSync(absolutePath, "utf-8")));
        return Keypair.fromSecretKey(secretKey);
    } catch (error) {
        console.error(`Error loading keypair from ${keypairPath}:`, error);
        process.exit(1);
    }
}
const adminKeypair = loadKeypair(ADMIN_KEYPAIR_PATH!);
const operationalWallet = loadKeypair(OPERATIONAL_WALLET_KEYPAIR_PATH!);

console.log("Agent Operational Wallet:", operationalWallet.publicKey.toBase58());
console.log("Agent using Admin Wallet for Mock Swap:", adminKeypair.publicKey.toBase58());

// --- Anchor 설정 ---
const opWalletProvider = new AnchorProvider(connection, new Wallet(operationalWallet), { commitment: 'finalized' });

// --- IDL 및 프로그램 인스턴스 ---
let revenueEngineProgram: Program<RevenueEngine>;
let mockSwapProgram: Program<MockSwapProgram>;
try {
    const revenueEngineIdl: Idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../target/idl/revenue_engine.json"), "utf-8"));
    const mockSwapIdl: Idl = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../target/idl/mock_swap_program.json"), "utf-8"));
    revenueEngineProgram = new Program<RevenueEngine>(revenueEngineIdl as any, opWalletProvider);
    mockSwapProgram = new Program<MockSwapProgram>(mockSwapIdl as any, opWalletProvider);
    console.log("Agent using RevenueEngine ID:", revenueEngineProgram.programId.toBase58());
    console.log("Agent using MockSwapProgram ID:", mockSwapProgram.programId.toBase58());
} catch (error) {
    console.error("Error loading IDL or creating program instances:", error);
    process.exit(1);
}

// --- Helper: ATA 잔액 가져오기 ---
async function getTokenBalance(mint: PublicKey, owner: PublicKey): Promise<bigint> {
    try {
        const ata = await getAssociatedTokenAddress(mint, owner);
        const accountInfo = await getAccount(connection, ata);
        return accountInfo.amount;
    } catch (error) {
        if (error instanceof Error && (error.message.includes('could not find account') || error.message.includes('TokenAccountNotFoundError'))) {
            return BigInt(0);
        }
        // console.warn(`Warning: Could not get balance for mint ${mint.toBase58()} of owner ${owner.toBase58()}:`, error); // 로그 너무 많아질 수 있어 주석 처리
        return BigInt(0);
    }
}

// --- Helper: 토큰 양 포맷팅 함수 ---
export function formatTokenAmount(amount: bigint, decimals: number): string {
    const factor = 10n ** BigInt(decimals);
    const integerPart = amount / factor;
    const fractionalPart = amount % factor;
    if (fractionalPart === 0n) {
        return integerPart.toString();
    } else {
        const fractionalString = fractionalPart.toString().padStart(decimals, '0').replace(/0+$/, '').substring(0, 6);
        return `${integerPart}.${fractionalString || '0'}`;
    }
}

// --- Helper: 잔액 조회 및 DB 업데이트 ---
async function updateWalletBalancesInDB() {
    try {
        const currentUsdc = await getTokenBalance(usdcMint, operationalWallet.publicKey);
        const currentHaio = await getTokenBalance(haioMint, operationalWallet.publicKey);
        const currentAth = await getTokenBalance(athMint, operationalWallet.publicKey);
        // BigInt를 number로 안전하게 변환 (소수점 처리 포함)
        const currentUsdcNumber = Number(currentUsdc) / (10**USDC_DECIMALS);
        const currentHaioNumber = Number(currentHaio) / (10**HAIO_DECIMALS);
        const currentAthNumber = Number(currentAth) / (10**ATH_DECIMALS);
        await updateStatus({
            opUsdcBalance: currentUsdcNumber,
            opHaioBalance: currentHaioNumber,
            opAthBalance: currentAthNumber,
        });
    } catch (error) {
        console.error("Error updating wallet balances in DB:", error);
        await addLog(`Error updating wallet balances in DB: ${(error as Error).message}`, "error");
    }
}

export async function transferUsdcFromAdminToOp(amount: bigint): Promise<string> {
    console.log(`[ADMIN ACTION] Transferring ${formatTokenAmount(amount, USDC_DECIMALS)} USDC from Admin to Op Wallet...`);
    await addLog(`Admin sending ${formatTokenAmount(amount, USDC_DECIMALS)} USDC to Op Wallet...`, 'process'); // DB Log

    try {
        const adminUsdcAta = await getAssociatedTokenAddress(usdcMint, adminKeypair.publicKey);
        const opWalletUsdcAta = await getAssociatedTokenAddress(usdcMint, operationalWallet.publicKey);

        // 계정 존재 확인 (init에서 생성됨 가정)
        await getAccount(connection, adminUsdcAta);
        await getAccount(connection, opWalletUsdcAta);

        const txSignature = await transfer(
            connection,
            adminKeypair,          // Payer & Source Authority
            adminUsdcAta,          // Source ATA
            opWalletUsdcAta,       // Destination ATA
            adminKeypair.publicKey, // Authority of source
            amount,
            [],
            { commitment: 'finalized' }
        );
        await connection.confirmTransaction(txSignature, 'finalized');
        console.log(`   ✅ [ADMIN ACTION] USDC Transfer successful! Tx: ${txSignature}`);
        await addLog(`Admin sent USDC successfully.`, 'success', txSignature); // DB Log
        return txSignature;
    } catch (error: any) {
        console.error("   ❌ [ADMIN ACTION] USDC Transfer failed:", error);
        await addLog(`Admin failed to send USDC: ${error.message}`, 'error'); // DB Log
        throw error; // 에러를 다시 던져 API 응답에서 처리하도록 함
    }
}



// --- 워커 메인 로직 ---
let isProcessing = false; // 동시 실행 방지 플래그

export async function runAgentCycleOnce() {
    if (isProcessing) {
        return; // 이미 처리 중이면 조용히 종료
    }
    isProcessing = true;
    let cycleError: Error | null = null; // 사이클 내 에러 저장 변수
    let currentStepForStatus: string | null = 'CHECKING_BALANCE'; // 현재 단계 추적

    try {
        await updateStatus({ status: 'PROCESSING', current_step: currentStepForStatus, lastError: null });
        await addLog("Starting agent cycle...", "process");
        console.log(`[${new Date().toLocaleTimeString()}] Checking Operational Wallet USDC balance...`);

        let opWalletUsdcBalance = await getTokenBalance(usdcMint, operationalWallet.publicKey);
        await updateWalletBalancesInDB(); // 초기 잔액 DB 업데이트
        const usdcBalanceFormatted = formatTokenAmount(opWalletUsdcBalance, USDC_DECIMALS);
        console.log(` Current USDC Balance: ${usdcBalanceFormatted} USDC`);
        await addLog(`Current USDC Balance: ${usdcBalanceFormatted} USDC`, "info");

        if (opWalletUsdcBalance >= usdcThreshold) {
            const thresholdFormatted = formatTokenAmount(usdcThreshold, USDC_DECIMALS);
            console.log(`USDC balance meets threshold. Starting process...`);
            await addLog(`USDC balance meets threshold. Starting process...`, "info");

            // --- 1. ATH 예산 확보 및 지불 ---
            currentStepForStatus = 'SWAPPING_ATH';
            await updateStatus({ current_step: currentStepForStatus });
            const usdcForAthPayment = (opWalletUsdcBalance * BigInt(athPaymentRatioBps)) / BigInt(10000);
            const usdcForAthFormatted = formatTokenAmount(usdcForAthPayment, USDC_DECIMALS);
            await addLog(`Calculating ATH payment: ${usdcForAthFormatted} USDC needed.`, "info");

            if (usdcForAthPayment > 0) {
                await addLog(`Attempting to swap ${usdcForAthFormatted} USDC for ATH...`, "process");
                let swapAthTxId: string | undefined;
                try {
                    const userUsdcAta = await getAssociatedTokenAddress(usdcMint, operationalWallet.publicKey);
                    const userAthAta = await getAssociatedTokenAddress(athMint, operationalWallet.publicKey);
                    await getAccount(connection, userUsdcAta); // 존재 확인
                    await getAccount(connection, userAthAta); // 존재 확인

                    const accounts = {
                        userOrOpWallet: operationalWallet.publicKey,
                        admin: adminKeypair.publicKey,
                        userUsdcAccount: userUsdcAta,
                        userAthAccount: userAthAta,
                        adminUsdcVault: mockUsdcVault,
                        adminAthVault: mockAthVault,
                        tokenProgram: TOKEN_PROGRAM_ID,
                        usdcMint: usdcMint,
                        athMint: athMint,
                    };
                    swapAthTxId = await mockSwapProgram.methods
                        .swapUsdcForAth(new anchor.BN(usdcForAthPayment.toString()))
                        .accounts(accounts)
                        .signers([operationalWallet, adminKeypair])
                        .rpc({ commitment: 'finalized', skipPreflight: true });
                    await connection.confirmTransaction(swapAthTxId, 'finalized');
                    await addLog(`ATH Swap successful!`, "success", swapAthTxId);
                    await updateWalletBalancesInDB(); // 잔액 업데이트

                    // ATH 전송
                    currentStepForStatus = 'PAYING_ATH';
                    await updateStatus({ current_step: currentStepForStatus });
                    await new Promise(resolve => setTimeout(resolve, 500)); // 지연
                    const opWalletAthBalance = await getTokenBalance(athMint, operationalWallet.publicKey);
                    const athBalanceFormatted = formatTokenAmount(opWalletAthBalance, ATH_DECIMALS);
                    if (opWalletAthBalance > 0) {
                        await addLog(`Attempting to send ${athBalanceFormatted} ATH to Aethir wallet...`, "process");
                        let paymentTxId: string | undefined;
                        try {
                            const sourceAthAta = userAthAta;
                            const destAthAta = await getAssociatedTokenAddress(athMint, aethirPaymentWallet);
                            await getAccount(connection, destAthAta); // 존재 확인

                            paymentTxId = await transfer(
                                connection, operationalWallet, sourceAthAta, destAthAta, operationalWallet, opWalletAthBalance, [], { commitment: 'finalized' }
                            );
                            await connection.confirmTransaction(paymentTxId, 'finalized');
                            await addLog(`ATH sent to Aethir wallet!`, "success", paymentTxId);
                            opWalletUsdcBalance -= usdcForAthPayment; // 메모리상 차감 (다음 스왑 계산 위해)
                            await updateWalletBalancesInDB(); // 잔액 업데이트
                        } catch (paymentError: any) {
                            cycleError = paymentError;
                            console.error(`   ❌ Sending ATH to Aethir failed:`, paymentError);
                            await addLog(`Sending ATH to Aethir failed: ${paymentError.message}`, "error");
                        }
                    }
                } catch (athSwapError: any) {
                    cycleError = athSwapError;
                    console.error(`   ❌ ATH Swap failed:`, athSwapError);
                    await addLog(`ATH Swap failed: ${athSwapError.message}`, "error", (athSwapError as any).tx);
                    if (athSwapError instanceof Error && 'logs' in athSwapError) { console.error("ATH Swap Logs:", (athSwapError as any).logs); }
                }
            } else {
                await addLog("No USDC allocated for ATH payment, skipping.", "info");
            }

            // --- 2. 나머지 USDC로 $HAiO 스왑 실행 ---
            currentStepForStatus = 'SWAPPING_HAIO';
            await updateStatus({ current_step: currentStepForStatus });
            const amountToSwapHaio = opWalletUsdcBalance;
            const amountToSwapFormatted = formatTokenAmount(amountToSwapHaio, USDC_DECIMALS);
            if (amountToSwapHaio > 0) {
                await addLog(`Attempting to swap remaining ${amountToSwapFormatted} USDC for $HAiO...`, "process");
                let swapHaioTxId: string | undefined;
                try {
                     const userUsdcAta = await getAssociatedTokenAddress(usdcMint, operationalWallet.publicKey);
                     const userHaioAta = await getAssociatedTokenAddress(haioMint, operationalWallet.publicKey);
                     await getAccount(connection, userHaioAta); // 존재 확인

                     const accounts = {
                         userOrOpWallet: operationalWallet.publicKey,
                         admin: adminKeypair.publicKey,
                         userUsdcAccount: userUsdcAta,
                         userHaioAccount: userHaioAta,
                         adminUsdcVault: mockUsdcVault,
                         adminHaioVault: mockHaioVault,
                         tokenProgram: TOKEN_PROGRAM_ID,
                         usdcMint: usdcMint,
                         haioMint: haioMint,
                     };
                     swapHaioTxId = await mockSwapProgram.methods
                         .swapUsdcForHaio(new anchor.BN(amountToSwapHaio.toString()))
                         .accounts(accounts)
                         .signers([operationalWallet, adminKeypair])
                         .rpc({ commitment: 'finalized', skipPreflight: true });
                     await connection.confirmTransaction(swapHaioTxId, 'finalized');
                     await addLog(`HAiO Swap successful!`, "success", swapHaioTxId);
                     opWalletUsdcBalance -= amountToSwapHaio; // 메모리상 차감
                     await updateWalletBalancesInDB(); // 잔액 업데이트
                } catch (haioSwapError: any) {
                    cycleError = haioSwapError;
                    console.error(`   ❌ HAiO Swap failed:`, haioSwapError);
                    await addLog(`HAiO Swap failed: ${haioSwapError.message}`, "error", (haioSwapError as any).tx);
                    if (haioSwapError instanceof Error && 'logs' in haioSwapError) { console.error("HAiO Swap Logs:", (haioSwapError as any).logs); }
                    throw haioSwapError;
                }
            } else {
                await addLog("No remaining USDC to swap for HAiO.", "info");
            }

            // --- 3. $HAiO 잔액 확인 및 소각 ---
            currentStepForStatus = 'BURNING';
            await updateStatus({ current_step: currentStepForStatus });
            await new Promise(resolve => setTimeout(resolve, 500));
            let opWalletHaioBalance = await getTokenBalance(haioMint, operationalWallet.publicKey);
            const haioBalanceFormatted = formatTokenAmount(opWalletHaioBalance, HAIO_DECIMALS);
            await addLog(`Current $HAiO balance after swap: ${haioBalanceFormatted} $HAiO`, "info");

            if (opWalletHaioBalance > 0) {
                const amountToBurn = (opWalletHaioBalance * BigInt(burnRatioBps)) / BigInt(10000);
                const burnAmountFormatted = formatTokenAmount(amountToBurn, HAIO_DECIMALS);
                await addLog(`Attempting to burn ${burnAmountFormatted} $HAiO...`, "process");

                if (amountToBurn > 0) {
                    let burnTxId: string | undefined;
                    try {
                        const opWalletHaioAta = await getAssociatedTokenAddress(haioMint, operationalWallet.publicKey);
                        burnTxId = await burn(
                            connection, operationalWallet, opWalletHaioAta, haioMint,
                            operationalWallet, amountToBurn, [], { commitment: 'finalized' }
                        );
                        await connection.confirmTransaction(burnTxId, 'finalized');
                        await addLog(`Burn successful!`, "success", burnTxId);
                        await updateWalletBalancesInDB(); // 잔액 업데이트
                    } catch (burnError: any) {
                        cycleError = burnError;
                        console.error(`   ❌ Burn failed:`, burnError);
                        await addLog(`Burn failed: ${burnError.message}`, "error");
                    }
                } else { await addLog("Burn amount is zero, skipping.", "info"); }

                // --- 4. 남은 $HAiO를 Revenue Safe로 이체 ---
                opWalletHaioBalance = await getTokenBalance(haioMint, operationalWallet.publicKey); // 소각 후 잔액 재확인
                currentStepForStatus = 'TRANSFERRING';
                await updateStatus({ current_step: currentStepForStatus });
                const amountToTransfer = opWalletHaioBalance;
                const transferAmountFormatted = formatTokenAmount(amountToTransfer, HAIO_DECIMALS);
                await addLog(`Attempting to transfer ${transferAmountFormatted} $HAiO to Revenue Safe...`, "process");

                if (amountToTransfer > 0) {
                    let transferTxId: string | undefined;
                    try {
                        const opWalletHaioAta = await getAssociatedTokenAddress(haioMint, operationalWallet.publicKey);
                        await getAccount(connection, revenueSafe); // Revenue Safe 존재 확인

                        transferTxId = await transfer(
                            connection, operationalWallet, opWalletHaioAta, revenueSafe,
                            operationalWallet, amountToTransfer, [], { commitment: 'finalized' }
                        );
                        await connection.confirmTransaction(transferTxId, 'finalized');
                        await addLog(`Transfer to Revenue Safe successful!`, "success", transferTxId);
                        await updateWalletBalancesInDB(); // 잔액 업데이트 (Op Wallet HAiO 0 됨)

                        // --- 5. Distribute 호출 ---
                        currentStepForStatus = 'DISTRIBUTING';
                        await updateStatus({ current_step: currentStepForStatus });
                        await addLog(`Triggering distribute_revenue instruction...`, "process");
                        let distributeTxId: string | undefined;
                        try {
                             const engineStateInfo = await revenueEngineProgram.account.engineState.fetch(revenueEnginePda);
                             const distributeAccounts = {
                                 engineState: revenueEnginePda,
                                 revenueSafe: revenueSafe,
                                 rewardPoolPda: engineStateInfo.rewardPoolPda,
                                 daoTreasuryPda: engineStateInfo.daoTreasuryPda,
                                 developerTreasuryPda: engineStateInfo.developerTreasuryPda,
                                 tokenProgram: TOKEN_PROGRAM_ID,
                             };
                             distributeTxId = await revenueEngineProgram.methods
                                .distributeRevenue()
                                .accounts(distributeAccounts)
                                .rpc({ commitment: 'finalized', skipPreflight: true });
                             await connection.confirmTransaction(distributeTxId, 'finalized');
                             await addLog(`distribute_revenue called successfully!`, "success", distributeTxId);
                             // 분배 후 Revenue Safe 잔액은 0이 되지만, Op Wallet 잔액은 영향 없음
                        } catch (distributeError: any) {
                            cycleError = distributeError;
                            console.error(`   ❌ Calling distribute_revenue failed:`, distributeError);
                            await addLog(`Calling distribute_revenue failed: ${distributeError.message}`, "error", (distributeError as any).tx);
                        }
                    } catch (transferError: any) {
                        cycleError = transferError;
                        console.error(`   ❌ Transfer to Revenue Safe failed:`, transferError);
                        await addLog(`Transfer to Revenue Safe failed: ${transferError.message}`, "error");
                    }
                } else { await addLog("No remaining $HAiO to transfer.", "info"); }
            } else { await addLog("$HAiO balance is zero after swap.", "info"); }

            // 사이클 종료 로그 및 상태
            currentStepForStatus = 'DONE'; // 최종 단계 설정
            if (cycleError) {
                await addLog("Agent cycle finished with errors.", "error");
                await updateStatus({ status: 'ERROR', current_step: currentStepForStatus, lastError: cycleError.message });
            } else {
                await addLog("Agent cycle finished successfully.", "success");
                await updateStatus({ status: 'IDLE', current_step: currentStepForStatus }); // 최종 상태 IDLE
            }

        } else {
            // 잔액 부족 시 IDLE 상태 유지
            await updateStatus({ status: 'IDLE', current_step: null });
        }
    } catch (error: any) {
        cycleError = error;
        console.error(`[${new Date().toLocaleTimeString()}] Critical Error in Agent cycle:`, error);
        await addLog(`Critical Error in Agent cycle: ${error.message}`, "error");
        await updateStatus({ status: 'ERROR', current_step: currentStepForStatus, lastError: error.message }); // 에러 발생 시 현재 단계 유지 또는 null
    } finally {
        isProcessing = false;
        // 최종 잔액 DB 업데이트
        await updateWalletBalancesInDB();
        console.log(`[${new Date().toLocaleTimeString()}] Agent cycle ended. Scheduling next check...`);
    }
}

// --- 주기적 실행 로직 ---
async function startAgent() {
    await initializeDatabase();
    console.log("Starting HAiO Agent...");
    await addLog("Agent worker started.", "info");
    // 초기 잔액 DB 반영
    await updateWalletBalancesInDB();
    console.log("Using RPC:", RPC_URL);
    console.log("Checking USDC balance in Operational Wallet every", checkInterval / 1000, "seconds.");
    console.log("USDC Threshold:", formatTokenAmount(usdcThreshold, USDC_DECIMALS), "USDC");
    console.log("Burn Ratio:", burnRatioBps / 100, "%");
    console.log("Aethir Payment Wallet:", aethirPaymentWallet.toBase58());
    console.log("ATH Payment Ratio:", athPaymentRatioBps / 100, "%");

    // setInterval(runAgentCycleOnce, checkInterval);
}

// --- Agent 시작 ---
// startAgent();