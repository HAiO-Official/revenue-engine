/* eslint-disable @typescript-eslint/no-non-null-assertion */
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3, Idl, Wallet } from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, Connection, ConfirmOptions, LAMPORTS_PER_SOL, AccountInfo } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, transfer as splTransfer, createMint, getMint, TokenAccountNotFoundError, getOrCreateAssociatedTokenAccount, mintTo, Account as TokenAccountInfo, unpackAccount } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import fs from "fs";
import os from "os";
import path from "path";
import dotenv from 'dotenv';

// IDL and Types import
import revenueEngineIdlJson from "../target/idl/revenue_engine.json";
import stakingIdlJson from "../target/idl/staking_program.json";
import mockSwapIdlJson from "../target/idl/mock_swap_program.json";
import { RevenueEngine } from "../target/types/revenue_engine";
import { StakingProgram } from "../target/types/staking_program";
import { MockSwapProgram } from "../target/types/mock_swap_program";

// --- Configuration Values ---
const RPC_URL = "http://localhost:8899";
const USDC_DECIMALS = 6;
const HAIO_DECIMALS = 9;
const NFT_DECIMALS = 0;
const STAKING_RATIO_BPS = 8000;
const DAO_RATIO_BPS = 1000;
const DEVELOPER_RATIO_BPS = 1000;
const ATH_DECIMALS = 9; // Aethir token Decimals (assumed)
const ATH_PAYMENT_RATIO_BPS = 1000; // Example: 10% of revenue to ATH
const ATH_PER_USDC = 1; // Example: 1 USDC = 1 ATH (Mock Swap ratio)
const INITIAL_ADMIN_ATH_LIQUIDITY = BigInt(100_000_000 * (10 ** ATH_DECIMALS)); // MockSwap initial ATH
const INITIAL_HAIO_LIQUIDITY = BigInt(10_000_000 * (10 ** HAIO_DECIMALS)); // Admin Vault initial liquidity
const ADMIN_INITIAL_HAIO_MINT_AMOUNT = BigInt(100_000_000 * (10 ** HAIO_DECIMALS)); // Admin initial holding
const INITIAL_OP_WALLET_USDC_AMOUNT = BigInt(50 * (10**USDC_DECIMALS)); // Op Wallet initial USDC
const INITIAL_EXTERNAL_WALLET_USDC_AMOUNT = BigInt(100_000_000 * (10**USDC_DECIMALS)); // External Wallet initial USDC
const USER_NFT_MINT_COUNT = 1; // Number of NFTs to mint for user


// --- Keypair File Path Configuration ---
const KEYPAIR_DIR = path.join(__dirname, '..', 'keypairs');
const ADMIN_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'id.json');
const USDC_MINT_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'usdc-mint.json');
const HAIO_MINT_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'haio-mint.json');
const NFT_MINT_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'nft-mint.json');
const OP_WALLET_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'op-wallet.json');
const EXTERNAL_WALLET_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'external.json'); // External depositor wallet path
const USER_WALLET_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'haio-user.json');    // NFT holder wallet path
const ATH_MINT_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'ath-mint.json');
const AETHIR_PAYMENT_WALLET_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'aethir-wallet.json'); // Aethir wallet keypair (for testing)
const REVENUE_ENGINE_DAO_TREASURY_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'revenue-engine-dao-treasury.json');
const REVENUE_ENGINE_DEVELOPER_TREASURY_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'revenue-engine-developer-treasury.json');


// --- .env File Paths ---
const WORKER_ENV_FILE_PATH = path.join(__dirname, '..', 'app', '.env'); // Worker .env
const FE_ENV_FILE_PATH = path.join(__dirname, '..', 'frontend', '.env'); // Frontend .env

// --- Helper Function: Update .env File (with path argument) ---
function updateEnvFile(filePath: string, updates: Record<string, string>) {
    const targetDir = path.dirname(filePath);
    if (!fs.existsSync(targetDir)) { fs.mkdirSync(targetDir, { recursive: true }); }
    let envConfig: Record<string, string> = {};
    if (fs.existsSync(filePath)) { envConfig = dotenv.parse(fs.readFileSync(filePath, 'utf-8')); }
    for (const key in updates) { envConfig[key] = updates[key]; }
    const newEnvContent = Object.entries(envConfig).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(filePath, newEnvContent);
    console.log(`\nUpdated ${filePath}`);
}


// --- Helper Function: Load or Create Keypair ---
function loadOrCreateKeypair(keypairPath: string): Keypair {
    if (fs.existsSync(keypairPath)) {
        const secretKey = Buffer.from(JSON.parse(fs.readFileSync(keypairPath, "utf-8")));
        return Keypair.fromSecretKey(secretKey);
    } else {
        const keypair = Keypair.generate();
        if (!fs.existsSync(KEYPAIR_DIR)) { fs.mkdirSync(KEYPAIR_DIR, { recursive: true }); }
        fs.writeFileSync(keypairPath, JSON.stringify(Array.from(keypair.secretKey)));
        console.log(`Generated new keypair and saved to ${keypairPath}`);
        return keypair;
    }
}

// --- Helper Function: Create Mint (Idempotent) ---
async function createMintIfNotExists(
    connection: Connection, payer: Keypair, mintAuthority: PublicKey,
    freezeAuthority: PublicKey | null, decimals: number, mintKeypair: Keypair,
    confirmOptions?: ConfirmOptions
): Promise<PublicKey> {
    try {
        await getMint(connection, mintKeypair.publicKey, confirmOptions?.commitment, TOKEN_PROGRAM_ID);
        return mintKeypair.publicKey;
    } catch (error: unknown) {
        if (error instanceof TokenAccountNotFoundError || (error instanceof Error && error.message.includes('Account does not exist'))) {
            console.log(`Mint ${mintKeypair.publicKey.toBase58()} not found, creating...`);
        } else { throw error; }
    }
    try {
        const mint = await createMint( connection, payer, mintAuthority, freezeAuthority, decimals, mintKeypair, confirmOptions, TOKEN_PROGRAM_ID );
        console.log(`Mint ${mint.toBase58()} created successfully.`);
        return mint;
    } catch (creationError) { throw creationError; }
}

// --- Helper Function: Get Token Account Info (Simple Version) ---
async function getTokenBalance(connection: Connection, accountPubkey: PublicKey): Promise<bigint> {
    try {
        const accountInfo = await connection.getAccountInfo(accountPubkey);
        if (!accountInfo) return BigInt(0);
        const data = unpackAccount(accountPubkey, accountInfo, TOKEN_PROGRAM_ID);
        return data.amount;
    } catch { return BigInt(0); }
}

async function main() {
    // --- Provider Setup ---
    if (!fs.existsSync(ADMIN_KEYPAIR_PATH)) { console.error(`Admin keypair not found at ${ADMIN_KEYPAIR_PATH}`); process.exit(1); }
    const adminKeypair = loadOrCreateKeypair(ADMIN_KEYPAIR_PATH);
    const opWalletKeypair = loadOrCreateKeypair(OP_WALLET_KEYPAIR_PATH);
    const externalWalletKeypair = loadOrCreateKeypair(EXTERNAL_WALLET_KEYPAIR_PATH); // External Wallet load/create
    const userWalletKeypair = loadOrCreateKeypair(USER_WALLET_KEYPAIR_PATH);       // User Wallet load/create
    const aethirPaymentWalletKeypair = loadOrCreateKeypair(AETHIR_PAYMENT_WALLET_KEYPAIR_PATH); // Aethir wallet keypair
    const revenueEngineDaoTreasuryKeypair = loadOrCreateKeypair(REVENUE_ENGINE_DAO_TREASURY_KEYPAIR_PATH); // Revenue Engine DAO Treasury keypair
    const revenueEngineDeveloperTreasuryKeypair = loadOrCreateKeypair(REVENUE_ENGINE_DEVELOPER_TREASURY_KEYPAIR_PATH); // Revenue Engine Developer Treasury keypair

    console.log("Initializer Admin Wallet:", adminKeypair.publicKey.toBase58());
    console.log("Operational Wallet:", opWalletKeypair.publicKey.toBase58());
    console.log("External Wallet (USDC Sender):", externalWalletKeypair.publicKey.toBase58()); // Log added
    console.log("User Wallet (NFT Holder):", userWalletKeypair.publicKey.toBase58());       // Log added
    console.log("Aethir Payment Wallet (Mock):", aethirPaymentWalletKeypair.publicKey.toBase58());
    console.log("Revenue Engine DAO Treasury:", revenueEngineDaoTreasuryKeypair.publicKey.toBase58());
    console.log("Revenue Engine Developer Treasury:", revenueEngineDeveloperTreasuryKeypair.publicKey.toBase58());

    const connection: Connection = new web3.Connection(RPC_URL, "confirmed");
    const adminWallet: Wallet = new NodeWallet(adminKeypair);
    const provider: AnchorProvider = new AnchorProvider(connection, adminWallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    // --- Initial SOL Airdrop ---
    console.log("\nAirdropping SOL if needed...");
    await Promise.all([
        (async () => {
            if (await connection.getBalance(adminKeypair.publicKey) < 0.5 * LAMPORTS_PER_SOL) {
                console.log(` Airdropping 2 SOL to Admin Wallet...`);
                await connection.requestAirdrop(adminKeypair.publicKey, 2 * LAMPORTS_PER_SOL).then(sig => connection.confirmTransaction(sig, 'finalized'));
                console.log("  Admin Airdrop finalized.");
            } else { console.log(" Admin Wallet has sufficient SOL."); }
        })(),
        (async () => {
            if (await connection.getBalance(opWalletKeypair.publicKey) < 0.5 * LAMPORTS_PER_SOL) {
                console.log(` Airdropping 2 SOL to Operational Wallet...`);
                 await connection.requestAirdrop(opWalletKeypair.publicKey, 2 * LAMPORTS_PER_SOL).then(sig => connection.confirmTransaction(sig, 'finalized'));
                console.log("  Operational Wallet Airdrop finalized.");
            } else { console.log(" Operational Wallet has sufficient SOL."); }
        })(),        (async () => { // External Wallet airdrop added
            if (await connection.getBalance(externalWalletKeypair.publicKey) < 0.5 * LAMPORTS_PER_SOL) {
                console.log(` Airdropping 2 SOL to External Wallet...`);
                await connection.requestAirdrop(externalWalletKeypair.publicKey, 2 * LAMPORTS_PER_SOL).then(sig => connection.confirmTransaction(sig, 'finalized'));
                console.log("  External Wallet Airdrop finalized.");
            } else { console.log(" External Wallet has sufficient SOL."); }
        })(),
        (async () => { // User Wallet airdrop added
            if (await connection.getBalance(userWalletKeypair.publicKey) < 0.5 * LAMPORTS_PER_SOL) {
                console.log(` Airdropping 2 SOL to User Wallet...`);
                await connection.requestAirdrop(userWalletKeypair.publicKey, 2 * LAMPORTS_PER_SOL).then(sig => connection.confirmTransaction(sig, 'finalized'));
                console.log("  User Wallet Airdrop finalized.");
            } else { console.log(" User Wallet has sufficient SOL."); }
        })(),
        (async () => {
            if (await connection.getBalance(aethirPaymentWalletKeypair.publicKey) < 0.1 * LAMPORTS_PER_SOL) {
                console.log(` Airdropping 1 SOL to Aethir Payment Wallet...`);
                await connection.requestAirdrop(aethirPaymentWalletKeypair.publicKey, 1 * LAMPORTS_PER_SOL).then(sig => connection.confirmTransaction(sig, 'finalized'));
                console.log("  Aethir Payment Wallet Airdrop finalized.");
            } else { console.log(" Aethir Payment Wallet has sufficient SOL."); }
        })(),    
    (async () => { // DAO Treasury Authority airdrop added
        if (await connection.getBalance(revenueEngineDaoTreasuryKeypair.publicKey) < 0.1 * LAMPORTS_PER_SOL) {
            console.log(` Airdropping 0.5 SOL to DAO Treasury Authority Wallet...`);
            await connection.requestAirdrop(revenueEngineDaoTreasuryKeypair.publicKey, 0.5 * LAMPORTS_PER_SOL).then(sig => connection.confirmTransaction(sig, 'finalized'));
            console.log("  DAO Treasury Authority Airdrop finalized.");
        } else { console.log(" DAO Treasury Authority Wallet has sufficient SOL."); }
    })(),
    (async () => { // Developer Treasury Authority airdrop added
        if (await connection.getBalance(revenueEngineDeveloperTreasuryKeypair.publicKey) < 0.1 * LAMPORTS_PER_SOL) {
            console.log(` Airdropping 0.5 SOL to Developer Treasury Authority Wallet...`);
            await connection.requestAirdrop(revenueEngineDeveloperTreasuryKeypair.publicKey, 0.5 * LAMPORTS_PER_SOL).then(sig => connection.confirmTransaction(sig, 'finalized'));
            console.log("  Developer Treasury Authority Airdrop finalized.");
        } else { console.log(" Developer Treasury Authority Wallet has sufficient SOL."); }
    })()
    ]).catch(err => console.warn(" Airdrop failed (rate limit?):", err?.message || err));


    // --- Load Program Clients ---
    const revenueEngineIdl: Idl = revenueEngineIdlJson as Idl;
    const stakingIdl: Idl = stakingIdlJson as Idl;
    const mockSwapIdl: Idl = mockSwapIdlJson as Idl;
    const revenueEngineProgram = new Program<RevenueEngine>(revenueEngineIdl, provider);
    const stakingProgram = new Program<StakingProgram>(stakingIdl, provider);
    const mockSwapProgram = new Program<MockSwapProgram>(mockSwapIdl, provider);
    const revenueEngineProgramId = revenueEngineProgram.programId;
    const stakingProgramId = stakingProgram.programId;
    const mockSwapProgramId = mockSwapProgram.programId;
    console.log("\nProgram IDs:");
    console.log(" RevenueEngine:", revenueEngineProgramId.toBase58());
    console.log(" Staking:", stakingProgramId.toBase58());
    console.log(" MockSwap:", mockSwapProgramId.toBase58());

    // --- Create or Load Mints ---
    console.log("\nCreating/Loading Mints...");
    const confirmOptions: ConfirmOptions = { commitment: "confirmed" };
    const usdcMintKeypair = loadOrCreateKeypair(USDC_MINT_KEYPAIR_PATH);
    const haioMintKeypair = loadOrCreateKeypair(HAIO_MINT_KEYPAIR_PATH);
    const nftMintKeypair = loadOrCreateKeypair(NFT_MINT_KEYPAIR_PATH);
    const athMintKeypair = loadOrCreateKeypair(ATH_MINT_KEYPAIR_PATH); // ATH mint keypair

    let usdcMintPubkey: PublicKey;
    let haioMintPubkey: PublicKey;
    let nftMintPubkey: PublicKey;
    let athMintPubkey: PublicKey; // ATH added

    try {
        [usdcMintPubkey, haioMintPubkey, nftMintPubkey, athMintPubkey] = await Promise.all([
            createMintIfNotExists( connection, adminKeypair, adminKeypair.publicKey, null, USDC_DECIMALS, usdcMintKeypair, confirmOptions ),
            createMintIfNotExists( connection, adminKeypair, adminKeypair.publicKey, null, HAIO_DECIMALS, haioMintKeypair, confirmOptions ),
            createMintIfNotExists( connection, adminKeypair, adminKeypair.publicKey, null, NFT_DECIMALS, nftMintKeypair, confirmOptions),
            createMintIfNotExists( connection, adminKeypair, adminKeypair.publicKey, null, ATH_DECIMALS, athMintKeypair, confirmOptions ) // ATH mint create
        ]);
        console.log(` Using USDC Mint: ${usdcMintPubkey.toBase58()}`);
        console.log(` Using HAiO Mint: ${haioMintPubkey.toBase58()}`);
        console.log(` Using NFT Mint: ${nftMintPubkey.toBase58()}`);
        console.log(` Using ATH Mint: ${athMintPubkey.toBase58()}`); // ATH log added

    } catch (mintError) { console.error("Failed to create/load mints. Exiting.", mintError); process.exit(1); }

    // --- Calculate Key Addresses ---
    console.log("\nCalculating Addresses...");
    const [engineStatePDA, engineStateBump] = PublicKey.findProgramAddressSync(
        [Buffer.from("engine_state_v1")], 
        revenueEngineProgram.programId 
    );
    const [rewardPoolAuthorityPDA, /* rewardPoolAuthBump */] = PublicKey.findProgramAddressSync( [Buffer.from("reward_pool_authority_seed")], stakingProgramId );
    const revenueSafeATA = await getAssociatedTokenAddress(haioMintPubkey, engineStatePDA, true);
    const rewardPoolATA = await getAssociatedTokenAddress(haioMintPubkey, rewardPoolAuthorityPDA, true);
    const daoTreasuryAuthority = revenueEngineDaoTreasuryKeypair.publicKey; // <<< modified: new keypair use
    const developerTreasuryAuthority = revenueEngineDeveloperTreasuryKeypair.publicKey; // <<< modified: new keypair use
    const daoTreasuryATA = await getAssociatedTokenAddress(haioMintPubkey, daoTreasuryAuthority, false); // Owner changed
    const developerTreasuryATA = await getAssociatedTokenAddress(haioMintPubkey, developerTreasuryAuthority, false); // Owner changed
            // Admin's ATA (Mock Swap and initial minting use)
    const adminUsdcATA = await getAssociatedTokenAddress(usdcMintPubkey, adminKeypair.publicKey);
    const adminHaioATA = await getAssociatedTokenAddress(haioMintPubkey, adminKeypair.publicKey);
    // Operational Wallet's ATA
    const opWalletUsdcATA = await getAssociatedTokenAddress(usdcMintPubkey, opWalletKeypair.publicKey);
    const opWalletHaioATA = await getAssociatedTokenAddress(haioMintPubkey, opWalletKeypair.publicKey);
        // External Wallet ATA calculation added
        const externalWalletUsdcATA = await getAssociatedTokenAddress(usdcMintPubkey, externalWalletKeypair.publicKey);
        // User Wallet ATA calculation added
        const userUsdcATA = await getAssociatedTokenAddress(usdcMintPubkey, userWalletKeypair.publicKey); // FE demo use, not init
        const userHaioATA = await getAssociatedTokenAddress(haioMintPubkey, userWalletKeypair.publicKey);
        const userNftATA = await getAssociatedTokenAddress(nftMintPubkey, userWalletKeypair.publicKey); // NFT receive ATA
        const adminAthATA = await getAssociatedTokenAddress(athMintPubkey, adminKeypair.publicKey); // Admin ATH ATA
    const opWalletAthATA = await getAssociatedTokenAddress(athMintPubkey, opWalletKeypair.publicKey); // OpWallet ATH ATA
    const aethirPaymentATA = await getAssociatedTokenAddress(athMintPubkey, aethirPaymentWalletKeypair.publicKey); // Aethir payment target ATA

    console.log(` Revenue Engine PDA: ${engineStatePDA.toBase58()}`);
    console.log(` Reward Pool Authority PDA: ${rewardPoolAuthorityPDA.toBase58()}`);
    console.log(` Revenue Safe ATA (Owner: Engine PDA): ${revenueSafeATA.toBase58()}`); 
    console.log(` Reward Pool ATA (Owner: Reward Auth PDA): ${rewardPoolATA.toBase58()}`);  
    console.log(` DAO Treasury ATA (Owner: DAO Treasury Authority): ${daoTreasuryATA.toBase58()}`); 
    console.log(` Dev Treasury ATA (Owner: Developer Treasury Authority): ${developerTreasuryATA.toBase58()}`);    
    console.log(` Admin USDC ATA (Swap Vault): ${adminUsdcATA.toBase58()}`);
    console.log(` Admin HAiO ATA (Swap Vault): ${adminHaioATA.toBase58()}`);
    console.log(` OpWallet USDC ATA: ${opWalletUsdcATA.toBase58()}`);
    console.log(` OpWallet HAiO ATA: ${opWalletHaioATA.toBase58()}`);
    console.log(` External Wallet USDC ATA: ${externalWalletUsdcATA.toBase58()}`);
    console.log(` User Wallet USDC ATA: ${userUsdcATA.toBase58()}`);
    console.log(` User Wallet HAiO ATA: ${userHaioATA.toBase58()}`);
    console.log(` User Wallet NFT ATA: ${userNftATA.toBase58()}`);
    console.log(` Admin ATH ATA (Swap Vault): ${adminAthATA.toBase58()}`);
    console.log(` OpWallet ATH ATA: ${opWalletAthATA.toBase58()}`);
    console.log(` Aethir Payment ATA (Mock): ${aethirPaymentATA.toBase58()}`);

    // --- Create Essential Accounts and Initial Minting ---
    console.log("\nEnsuring Accounts & Minting Tokens...");
    try {
        // All ATA create or verify (parallel processing)
        await Promise.all([
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, haioMintPubkey, adminKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ), // Admin HAiO
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, usdcMintPubkey, adminKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ), // Admin USDC
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, haioMintPubkey, engineStatePDA, true, confirmOptions?.commitment, confirmOptions ),      // revenueSafeATA
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, haioMintPubkey, rewardPoolAuthorityPDA, true, confirmOptions?.commitment, confirmOptions ), // rewardPoolATA
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, haioMintPubkey, daoTreasuryAuthority, false, confirmOptions?.commitment, confirmOptions ), // <<< modified: new Authority use
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, haioMintPubkey, developerTreasuryAuthority, false, confirmOptions?.commitment, confirmOptions ), // <<< modified: new Authority use
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, usdcMintPubkey, opWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ), // OpWallet USDC
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, haioMintPubkey, opWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ),  // OpWallet HAiO
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, usdcMintPubkey, externalWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ), // External USDC ATA
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, usdcMintPubkey, userWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ),      // User USDC ATA
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, haioMintPubkey, userWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ),      // User HAiO ATA
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, nftMintPubkey, userWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ),       // User NFT ATA
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, athMintPubkey, adminKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ), // Admin ATH
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, athMintPubkey, opWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ), // OpWallet ATH
            getOrCreateAssociatedTokenAccount( connection, adminKeypair, athMintPubkey, aethirPaymentWalletKeypair.publicKey, false, confirmOptions?.commitment, confirmOptions ) // Aethir Payment ATA
        ]);
        console.log(" Necessary ATAs ensured.");

        // Parallel mint
        await Promise.all([
             // Admin initial HAiO (liquidity supply use + extra)
             mintTo( connection, adminKeypair, haioMintPubkey, adminHaioATA, adminKeypair.publicKey, ADMIN_INITIAL_HAIO_MINT_AMOUNT + INITIAL_HAIO_LIQUIDITY, [], confirmOptions ),
             // OpWallet initial USDC
             mintTo( connection, adminKeypair, usdcMintPubkey, opWalletUsdcATA, adminKeypair.publicKey, INITIAL_OP_WALLET_USDC_AMOUNT, [], confirmOptions ),
             mintTo( connection, adminKeypair, usdcMintPubkey, externalWalletUsdcATA, adminKeypair.publicKey, INITIAL_EXTERNAL_WALLET_USDC_AMOUNT, [], confirmOptions ), // External Wallet initial USDC
             mintTo( connection, adminKeypair, nftMintPubkey, userNftATA, adminKeypair.publicKey, USER_NFT_MINT_COUNT, [], confirmOptions ), // User Wallet initial NFT
             mintTo( connection, adminKeypair, athMintPubkey, adminAthATA, adminKeypair.publicKey, INITIAL_ADMIN_ATH_LIQUIDITY, [], confirmOptions ), // Admin initial ATH (Swap use)

            ]);
            console.log(` Initial tokens minted: Admin(${ADMIN_INITIAL_HAIO_MINT_AMOUNT + INITIAL_HAIO_LIQUIDITY} HAiO), OpWallet(${INITIAL_OP_WALLET_USDC_AMOUNT} USDC), External(${INITIAL_EXTERNAL_WALLET_USDC_AMOUNT} USDC), User(${USER_NFT_MINT_COUNT} NFT)`);

        // Admin HAiO Vault (Admin's HAiO ATA) liquidity supply (separate call)
        // mintTo handled in one call, so this part is not needed (commented out or removed)
        /*
        console.log(` Supplying initial ${INITIAL_HAIO_LIQUIDITY} HAiO lamports to Vault (Admin HAiO ATA)...`);
        // await splTransfer( connection, adminKeypair, adminHaioATA, adminHaioATA, adminKeypair, INITIAL_HAIO_LIQUIDITY, [], confirmOptions, TOKEN_PROGRAM_ID ); // Sending to self is meaningless
        console.log(" Initial HAiO liquidity is already in Admin's HAiO ATA which acts as vault.");
        */


    } catch (ataOrMintError) { console.error("Error during ATA creation or initial minting:", ataOrMintError); process.exit(1); }

    // --- Program Initialization ---
    // 1. Mock Swap initialization (ATH Vault assumption)
    console.log("\nInitializing Mock Swap Program (with ATH)...");
    // Mock Swap program assumed to manage ATH Vault
    // initialize function needs ath_vault account addition (lib.rs modification needed)
    const [adminAthVaultPDA, /* athVaultBump */] = PublicKey.findProgramAddressSync(
        [Buffer.from("mock_ath_vault"), adminKeypair.publicKey.toBuffer()],
        mockSwapProgramId
    );
    console.log(` Mock ATH Vault PDA: ${adminAthVaultPDA.toBase58()}`);
    // Admin ATH Vault ATA create
    const adminAthVaultATA = await getOrCreateAssociatedTokenAccount(connection, adminKeypair, athMintPubkey, adminAthVaultPDA, true, confirmOptions?.commitment, confirmOptions);

    try {
        // initialize function signature change assumption (ath_vault, ath_mint addition)
        const tx = await mockSwapProgram.methods
            .initializeMockSwap() // Name kept or changed (e.g., initializeVaults)
            .accounts({
                admin: adminKeypair.publicKey,
                usdcMint: usdcMintPubkey,
                haioMint: haioMintPubkey,
                athMint: athMintPubkey, // ATH mint addition
                usdcVault: adminUsdcATA, // Vault use Admin ATA
                haioVault: adminHaioATA, // Vault use Admin ATA
                athVault: adminAthATA,   // Vault use Admin ATA
                // systemProgram: SystemProgram.programId,
                // tokenProgram: TOKEN_PROGRAM_ID,
                // rent: SYSVAR_RENT_PUBKEY,
            })
            .signers([adminKeypair])
            .rpc(confirmOptions);
        console.log(" Mock Swap Initialized/Verified (with ATH Vault). Tx:", tx);

        // Initial liquidity supply (Admin ATA -> Admin Vault ATA)
        console.log(` Supplying initial liquidity to Vaults...`);
        const transferHaioTx = await splTransfer( connection, adminKeypair, adminHaioATA, adminHaioATA, adminKeypair, INITIAL_HAIO_LIQUIDITY, [], confirmOptions);
        const transferAthTx = await splTransfer( connection, adminKeypair, adminAthATA, adminAthATA, adminKeypair, INITIAL_ADMIN_ATH_LIQUIDITY, [], confirmOptions);
        console.log(`  HAiO liquidity added. Tx: ${transferHaioTx}`);
        console.log(`  ATH liquidity added. Tx: ${transferAthTx}`);

    } catch (error) { 
        console.error(" Error Initializing Mock Swap:", error);
        if (error instanceof Error && 'logs' in error) { console.error("Init Logs:", (error as any).logs); }
     }
    // 2. RevenueEngine initialization
    console.log("\nInitializing RevenueEngine Program...");
     try {
         const initializeRevenueEngineAccounts = {
             authority: adminKeypair.publicKey,
             engineState: engineStatePDA,
             revenueSafe: revenueSafeATA,
             rewardPoolPda: rewardPoolATA,
             daoTreasuryPda: daoTreasuryATA,
             developerTreasuryPda: developerTreasuryATA,
             systemProgram: SystemProgram.programId,
             rent: SYSVAR_RENT_PUBKEY,
             tokenProgram: TOKEN_PROGRAM_ID,
         };

         const tx = await revenueEngineProgram.methods
             .initializeEngineState(STAKING_RATIO_BPS, DAO_RATIO_BPS, DEVELOPER_RATIO_BPS )
             .accounts(initializeRevenueEngineAccounts)
             .signers([adminKeypair])
             .rpc(confirmOptions);
         console.log(` Revenue Engine Initialized successfully. Tx: ${tx}`);
     } catch (error) {
        if (error instanceof Error && (error.message.includes("already in use") || error.message.includes("custom program error: 0x0"))) {
            console.log(" Revenue Engine likely already initialized.");
        } else {
           console.error(" Error Initializing Revenue Engine:", error);
           if (error instanceof Error && 'logs' in error) { console.error("Init Logs:", (error as any).logs); }
        }
     }

// --- Final key account status check (External, User addition) ---
console.log("\n--- Verifying Key Account Balances ---");
const opUsdcFinal = await getTokenBalance(connection, opWalletUsdcATA);
const adminHaioVaultFinal = await getTokenBalance(connection, adminHaioATA);
const externalUsdcFinal = await getTokenBalance(connection, externalWalletUsdcATA); // External balance check
const userNftFinal = await getTokenBalance(connection, userNftATA);         // User NFT balance check
const opAthFinal = await getTokenBalance(connection, opWalletAthATA);
const adminAthVaultFinal = await getTokenBalance(connection, adminAthATA); // Vault = Admin ATA
const daoTreasuryFinal = await getTokenBalance(connection, daoTreasuryATA);
const developerTreasuryFinal = await getTokenBalance(connection, developerTreasuryATA);

console.log(` Operational Wallet USDC Balance: ${opUsdcFinal}`);
console.log(` Admin HAiO Vault Balance (Used as Swap Vault): ${adminHaioVaultFinal}`);
console.log(` External Wallet USDC Balance: ${externalUsdcFinal}`); 
console.log(` User Wallet NFT Balance: ${userNftFinal}`);           
console.log(` Operational Wallet ATH Balance: ${opAthFinal}`);
console.log(` Admin ATH Vault Balance: ${adminAthVaultFinal}`);
console.log(` DAO Treasury Balance: ${daoTreasuryFinal}`);
console.log(` Developer Treasury Balance: ${developerTreasuryFinal}`);

if (opUsdcFinal !== INITIAL_OP_WALLET_USDC_AMOUNT) console.warn(" ⚠️ OpWallet USDC balance mismatch!");
if (adminHaioVaultFinal < INITIAL_HAIO_LIQUIDITY) console.warn(` ⚠️ Admin HAiO Vault liquidity low!`);
if (externalUsdcFinal !== INITIAL_EXTERNAL_WALLET_USDC_AMOUNT) console.warn(" ⚠️ External Wallet USDC balance mismatch!"); 
if (userNftFinal !== BigInt(USER_NFT_MINT_COUNT)) console.warn(" ⚠️ User Wallet NFT balance mismatch!");          
if (opAthFinal !== BigInt(0)) console.warn(" ⚠️ OpWallet ATH balance mismatch (should be 0)!");
if (adminAthVaultFinal < INITIAL_ADMIN_ATH_LIQUIDITY) console.warn(` ⚠️ Admin ATH Vault liquidity low!`);
if (daoTreasuryFinal !== BigInt(0)) console.warn(" ⚠️ DAO Treasury ATA balance mismatch (should be 0 initially)!");
if (developerTreasuryFinal !== BigInt(0)) console.warn(" ⚠️ Developer Treasury ATA balance mismatch (should be 0 initially)!");

console.log("--- Verification Finished ---");



     // --- Update .env Files (Worker & Frontend) ---
     console.log("\nUpdating .env files...");
     // Worker .env update
     const workerEnvUpdates: Record<string, string> = {
         RPC_URL: RPC_URL,
         ADMIN_KEYPAIR_PATH: `${path.relative(path.join(__dirname, '..', 'app'), path.resolve(ADMIN_KEYPAIR_PATH))}`,
         OPERATIONAL_WALLET_KEYPAIR_PATH: `${path.relative(path.join(__dirname, '..', 'app'), path.resolve(OP_WALLET_KEYPAIR_PATH))}`,
         EXTERNAL_WALLET_KEYPAIR_PATH: `${path.relative(path.join(__dirname, '..', 'app'), path.resolve(EXTERNAL_WALLET_KEYPAIR_PATH))}`,
         USDC_MINT_ADDRESS: usdcMintPubkey.toBase58(),
         HAIO_MINT_ADDRESS: haioMintPubkey.toBase58(),
         REVENUE_ENGINE_PROGRAM_ID: revenueEngineProgramId.toBase58(),
         // STAKING_PROGRAM_ID: stakingProgramId.toBase58(), // Worker does not directly call staking
         MOCK_SWAP_PROGRAM_ID: mockSwapProgramId.toBase58(),
         REVENUE_ENGINE_PDA: engineStatePDA.toBase58(),
         REVENUE_SAFE_ATA: revenueSafeATA.toBase58(),
         DAO_TREASURY_ATA: daoTreasuryATA.toBase58(),
         DEVELOPER_TREASURY_ATA: developerTreasuryATA.toBase58(),
         MOCK_USDC_VAULT_ATA: adminUsdcATA.toBase58(), // modified: Admin USDC ATA
         MOCK_HAIO_VAULT_ATA: adminHaioATA.toBase58(), // modified: Admin HAiO ATA
         USDC_THRESHOLD_LAMPORTS: process.env.USDC_THRESHOLD_LAMPORTS || "10000000",
         CHECK_INTERVAL_MS: process.env.CHECK_INTERVAL_MS || "60000",
         BURN_RATIO_BPS: process.env.BURN_RATIO_BPS || "5000",
         ATH_MINT_ADDRESS: athMintPubkey.toBase58(),
         AETHIR_PAYMENT_WALLET_ADDRESS: aethirPaymentWalletKeypair.publicKey.toBase58(), // Mock wallet address
         ATH_PAYMENT_RATIO_BPS: process.env.ATH_PAYMENT_RATIO_BPS || "1000", // Default 10%
         MOCK_ATH_VAULT_ATA: adminAthATA.toBase58(), // modified: Admin ATH ATA
 
     };
     updateEnvFile(WORKER_ENV_FILE_PATH, workerEnvUpdates); // Worker .env path use
 
     // Frontend .env update
     const frontendEnvUpdates: Record<string, string> = {
         REACT_APP_RPC_URL: RPC_URL,
         REACT_APP_REVENUE_ENGINE_PROGRAM_ID: revenueEngineProgramId.toBase58(),
         REACT_APP_STAKING_PROGRAM_ID: stakingProgramId.toBase58(),
         // REACT_APP_MOCK_SWAP_PROGRAM_ID: mockSwapProgramId.toBase58(), // FE not needed
         REACT_APP_USDC_MINT_ADDRESS: usdcMintPubkey.toBase58(),
         REACT_APP_HAIO_MINT_ADDRESS: haioMintPubkey.toBase58(),
         REACT_APP_REVENUE_ENGINE_PDA: engineStatePDA.toBase58(),
         REACT_APP_REWARD_POOL_ATA: rewardPoolATA.toBase58(), // Reward Pool ATA address
         REACT_APP_OP_WALLET_ADDRESS: opWalletKeypair.publicKey.toBase58(),
         REACT_APP_DEMO_NFT_MINT_ADDRESS: nftMintPubkey.toBase58(), // NFT mint address
         REACT_APP_ADMIN_USDC_VAULT_ATA: adminUsdcATA.toBase58(), // Admin Vault ATA
         REACT_APP_ADMIN_HAIO_VAULT_ATA: adminHaioATA.toBase58(), // Admin Vault ATA
         REACT_APP_REVENUE_SAFE_ATA: revenueSafeATA.toBase58(),
         REACT_APP_DAO_TREASURY_ATA: daoTreasuryATA.toBase58(), // DAO ATA
         REACT_APP_DEVELOPER_TREASURY_ATA: developerTreasuryATA.toBase58(), // Dev ATA
         REACT_APP_ATH_MINT_ADDRESS: athMintPubkey.toBase58(),
         REACT_APP_AETHIR_PAYMENT_WALLET_ADDRESS: aethirPaymentWalletKeypair.publicKey.toBase58(),
         REACT_APP_ADMIN_ATH_VAULT_ATA: adminAthATA.toBase58(), // modified: Admin ATH ATA
 
     };
     updateEnvFile(FE_ENV_FILE_PATH, frontendEnvUpdates); // Frontend .env path use
 
    // --- Final result output ---
    console.log("\n--- Initialization Script Finished ---");
    console.log("Key Addresses:");
    console.log(" External Wallet:", externalWalletKeypair.publicKey.toBase58());
    console.log(" User Wallet:", userWalletKeypair.publicKey.toBase58());
    console.log(" USDC Mint:", usdcMintPubkey.toBase58());
    console.log(" HAiO Mint:", haioMintPubkey.toBase58());
    console.log(" NFT Mint:", nftMintPubkey.toBase58());
    console.log(" Revenue Engine PDA:", engineStatePDA.toBase58());
    console.log(" Reward Pool Auth PDA:", rewardPoolAuthorityPDA.toBase58());
    console.log(" ATH Mint:", athMintPubkey.toBase58());
    console.log(" Aethir Payment Wallet (Mock):", aethirPaymentWalletKeypair.publicKey.toBase58());
    console.log("Key ATAs:");
    console.log(" Revenue Safe ATA:", revenueSafeATA.toBase58());
    console.log(" Reward Pool ATA:", rewardPoolATA.toBase58());
    console.log(" DAO Treasury ATA:", daoTreasuryATA.toBase58());
    console.log(" Dev Treasury ATA:", developerTreasuryATA.toBase58());
    console.log(" Admin USDC ATA (Swap Vault):", adminUsdcATA.toBase58());
    console.log(" Admin HAiO ATA (Swap Vault):", adminHaioATA.toBase58());
    console.log(" OpWallet USDC ATA:", opWalletUsdcATA.toBase58());
    console.log(" OpWallet HAiO ATA:", opWalletHaioATA.toBase58());
    console.log(" Admin ATH ATA (Swap Vault):", adminAthATA.toBase58());
    console.log(" OpWallet ATH ATA:", opWalletAthATA.toBase58());
    console.log(" Aethir Payment ATA (Mock):", aethirPaymentATA.toBase58());
    console.log("------------------------------------");
    console.log("\nWorker .env file updated. Ready to run worker.");
}

main().then(
    () => process.exit(0),
    err => {
        console.error("\nScript failed with error:");
        console.error(err);
        process.exit(1);
    },
);