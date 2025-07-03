import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, web3, Idl, Wallet, BN } from "@coral-xyz/anchor";
import {
    PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL,
    SYSVAR_RENT_PUBKEY, Connection, Transaction, ConfirmOptions,
    TransactionSignature
} from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path"; // path module added

// Direct IDL JSON file import (same as before)
import agentStateIdlJson from "../target/idl/agent_state_program.json";
import stakingIdlJson from "../target/idl/staking_program.json";
import mockSwapIdlJson from "../target/idl/mock_swap_program.json";

// IDL type import (same as before)
import { AgentStateProgram } from "../target/types/agent_state_program";
import { StakingProgram } from "../target/types/staking_program";
import { MockSwapProgram } from "../target/types/mock_swap_program";

// --- Keypair file path settings (same as init.ts) ---
const KEYPAIR_DIR = path.join(__dirname, '..', 'keypairs');
const USDC_MINT_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'usdc-mint.json');
const HAIO_MINT_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'haio-mint.json');
const NFT_MINT_KEYPAIR_PATH = path.join(KEYPAIR_DIR, 'nft-mint.json');

// --- Helper function: Load keypair ---
function loadKeypairFromFile(filePath: string): Keypair {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Keypair file not found at ${filePath}. Run init script first.`);
    }
    const secretKey = Buffer.from(JSON.parse(fs.readFileSync(filePath, "utf-8")));
    return Keypair.fromSecretKey(secretKey);
}

// --- Helper function: Create mint (not used in tests) ---
// createMintIfNotExists function removed or commented out

describe("Haio Finance E2E Test", () => {
    // --- Anchor Setup (same as before) ---
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const adminKeypairPath = os.homedir() + "/.config/solana/id.json";
    const keypairData = fs.readFileSync(adminKeypairPath, "utf-8");
    const adminKeypair = Keypair.fromSecretKey(Buffer.from(JSON.parse(keypairData)));
    const adminWallet: Wallet = new anchor.Wallet(adminKeypair);
    const provider = new AnchorProvider(connection, adminWallet, { commitment: "confirmed" });
    anchor.setProvider(provider);

    // --- Load program clients (same as before) ---
    const agentStateIdl: Idl = agentStateIdlJson as Idl;
    const stakingIdl: Idl = stakingIdlJson as Idl;
    const mockSwapIdl: Idl = mockSwapIdlJson as Idl;
    const agentStateProgram = new Program<AgentStateProgram>(agentStateIdl, provider);
    const stakingProgram = new Program<StakingProgram>(stakingIdl, provider);
    const mockSwapProgram = new Program<MockSwapProgram>(mockSwapIdl, provider);

    // --- Test Wallets (same as before) ---
    const admin = adminWallet;
    const user = Keypair.generate();
    const operationalWallet = Keypair.generate();

    // --- Addresses ---
    let usdcMint: PublicKey;
    let haioMint: PublicKey;
    let userNftMintPubkey: PublicKey; // NFT mint public key
    // let userNftMintKeypair: Keypair; // needed if loading full keypair

    let userUsdcAccount: PublicKey;
    let userHaioAccount: PublicKey;
    let userNftAccount: PublicKey; // user NFT account
    let opWalletUsdcAccount: PublicKey;
    let opWalletHaioAccount: PublicKey;

    // PDAs
    let agentStatePDA: PublicKey;
    let rewardPoolAuthorityPDA: PublicKey;
    let nftStakePDA: PublicKey;
    let usdcVaultPDA: PublicKey;
    let haioVaultPDA: PublicKey;
    // ATAs
    let revenueSafeATA: PublicKey;
    let rewardPoolATA: PublicKey;
    let daoTreasuryATA: PublicKey;
    let developerTreasuryATA: PublicKey;

    // --- Constants (same as before) ---
    const AGENT_ID = "DemoAgent001";
    const USDC_DECIMALS = 6; // must match init.ts
    const HAIO_DECIMALS = 9; // must match init.ts
    const NFT_DECIMALS = 0;  // must match init.ts
    const INITIAL_USER_USDC_LAMPORTS = BigInt(100 * (10 ** USDC_DECIMALS));
    const INITIAL_USER_HAIO_LAMPORTS = BigInt(0); // user starts with 0 HAiO
    const OP_WALLET_USDC_TRANSFER = BigInt(50 * (10 ** USDC_DECIMALS));
    const SWAP_RATE_HAIO_PER_USDC = 50;
    const OP_WALLET_HAIO_BURN_DIVISOR = BigInt(2);
    const confirmOptions: ConfirmOptions = { commitment: "confirmed" };
    const STAKING_RATIO_BPS = 8000;
    const DAO_RATIO_BPS = 1000;
    const DEVELOPER_RATIO_BPS = 1000;

    before(async () => {
        console.log("--- E2E Test Setup ---");

        // 1. Fund Test Wallets (same as before)
        console.log(`Airdropping SOL to User ${user.publicKey.toBase58()}...`);
        await provider.connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL);
        console.log(`Airdropping SOL to OpWallet ${operationalWallet.publicKey.toBase58()}...`);
        await provider.connection.requestAirdrop(operationalWallet.publicKey, 2 * LAMPORTS_PER_SOL);
        // Wait for airdrop to process
        await new Promise(resolve => setTimeout(resolve, 1500)); // slightly longer wait

        // 2. Load Shared Mints from Keypair Files
        console.log("Loading shared SPL Mints from ./keypairs...");
        try {
            const usdcMintKeypair = loadKeypairFromFile(USDC_MINT_KEYPAIR_PATH);
            const haioMintKeypair = loadKeypairFromFile(HAIO_MINT_KEYPAIR_PATH);
            const loadedNftMintKeypair = loadKeypairFromFile(NFT_MINT_KEYPAIR_PATH); // load NFT keypair

            usdcMint = usdcMintKeypair.publicKey;
            haioMint = haioMintKeypair.publicKey;
            userNftMintPubkey = loadedNftMintKeypair.publicKey; // assign public key
            // userNftMintKeypair = loadedNftMintKeypair; // needed if storing full keypair

            // Check if mints exist on-chain (optional but recommended)
            await spl.getMint(connection, usdcMint, confirmOptions.commitment);
            await spl.getMint(connection, haioMint, confirmOptions.commitment);
            await spl.getMint(connection, userNftMintPubkey, confirmOptions.commitment);
            console.log("Shared mints verified on-chain.");

        } catch (e) {
            console.error("Failed to load or verify shared mints.", e);
            console.error("Please ensure the init script ran successfully and keypair files exist in the 'keypairs' directory.");
            process.exit(1); // test abort
        }
        console.log(`Using Shared USDC Mint: ${usdcMint.toBase58()}`);
        console.log(`Using Shared HAiO Mint: ${haioMint.toBase58()}`);
        console.log(`Using Shared NFT Mint: ${userNftMintPubkey.toBase58()}`);

        // 3. Calculate PDAs (NFT Stake PDA calculation uses userNftMintPubkey)
        [agentStatePDA] = PublicKey.findProgramAddressSync( [Buffer.from("agent_state"), Buffer.from(AGENT_ID)], agentStateProgram.programId );
        [rewardPoolAuthorityPDA] = PublicKey.findProgramAddressSync( [Buffer.from("reward_pool_authority_seed")], stakingProgram.programId );
        [usdcVaultPDA] = PublicKey.findProgramAddressSync( [Buffer.from("mock_usdc_vault"), admin.publicKey.toBuffer()], mockSwapProgram.programId );
        [haioVaultPDA] = PublicKey.findProgramAddressSync( [Buffer.from("mock_haio_vault"), admin.publicKey.toBuffer()], mockSwapProgram.programId );
        [nftStakePDA] = PublicKey.findProgramAddressSync( [Buffer.from("nft_stake"), user.publicKey.toBuffer(), userNftMintPubkey.toBuffer()], stakingProgram.programId ); // modified
        console.log(`AgentState PDA: ${agentStatePDA.toBase58()}`);
        console.log(`Reward Pool Authority PDA: ${rewardPoolAuthorityPDA.toBase58()}`);
        console.log(`Mock USDC Vault PDA: ${usdcVaultPDA.toBase58()}`);
        console.log(`Mock HAiO Vault PDA: ${haioVaultPDA.toBase58()}`);
        console.log(`NFT Stake PDA: ${nftStakePDA.toBase58()}`);

        // 4. Calculate/Derive AgentState ATAs (uses shared haioMint)
        revenueSafeATA = await spl.getAssociatedTokenAddress(haioMint, agentStatePDA, true);
        rewardPoolATA = await spl.getAssociatedTokenAddress(haioMint, rewardPoolAuthorityPDA, true);
        daoTreasuryATA = await spl.getAssociatedTokenAddress(haioMint, agentStatePDA, true); // Owner: agentStatePDA
        developerTreasuryATA = await spl.getAssociatedTokenAddress(haioMint, agentStatePDA, true); // Owner: agentStatePDA
        console.log(`Revenue Safe ATA: ${revenueSafeATA.toBase58()}`);
        console.log(`Reward Pool ATA: ${rewardPoolATA.toBase58()}`);
        console.log(`DAO Treasury ATA: ${daoTreasuryATA.toBase58()}`); // added log
        console.log(`Developer Treasury ATA: ${developerTreasuryATA.toBase58()}`); // added log


        // 5. Create User & OpWallet ATAs and Mint Initial Tokens (uses shared Mint)
        console.log("Creating ATAs and minting initial tokens...");
        // User ATAs
        userUsdcAccount = (await spl.getOrCreateAssociatedTokenAccount(connection, adminKeypair, usdcMint, user.publicKey, false, confirmOptions?.commitment, confirmOptions)).address;
        userHaioAccount = (await spl.getOrCreateAssociatedTokenAccount(connection, adminKeypair, haioMint, user.publicKey, false, confirmOptions?.commitment, confirmOptions)).address;
        userNftAccount = (await spl.getOrCreateAssociatedTokenAccount(connection, adminKeypair, userNftMintPubkey, user.publicKey, false, confirmOptions?.commitment, confirmOptions)).address; // use shared NFT mint
        // OpWallet ATAs
        opWalletUsdcAccount = (await spl.getOrCreateAssociatedTokenAccount(connection, adminKeypair, usdcMint, operationalWallet.publicKey, false, confirmOptions?.commitment, confirmOptions)).address;
        opWalletHaioAccount = (await spl.getOrCreateAssociatedTokenAccount(connection, adminKeypair, haioMint, operationalWallet.publicKey, false, confirmOptions?.commitment, confirmOptions)).address;

        console.log(` User USDC ATA: ${userUsdcAccount.toBase58()}`);
        console.log(` User HAiO ATA: ${userHaioAccount.toBase58()}`);
        console.log(` User NFT ATA: ${userNftAccount.toBase58()}`);
        console.log(` OpWallet USDC ATA: ${opWalletUsdcAccount.toBase58()}`);
        console.log(` OpWallet HAiO ATA: ${opWalletHaioAccount.toBase58()}`);

        // Mint initial tokens (Admin must be mint authority)
        if (INITIAL_USER_USDC_LAMPORTS > 0) {
            // Check and mint if needed for User USDC balance
            const userUsdcInfo = await connection.getParsedAccountInfo(userUsdcAccount);
            let currentUsdcBalance = BigInt(0);
            if (userUsdcInfo.value && userUsdcInfo.value.data && 'parsed' in userUsdcInfo.value.data && userUsdcInfo.value.data.parsed.info) {
                 currentUsdcBalance = BigInt(userUsdcInfo.value.data.parsed.info.tokenAmount.uiAmount * (10**USDC_DECIMALS)); // Avoid uiAmount for precision
                 currentUsdcBalance = BigInt(userUsdcInfo.value.data.parsed.info.tokenAmount.amount);
            }
            if (currentUsdcBalance < INITIAL_USER_USDC_LAMPORTS) {
                 const amountToMint = INITIAL_USER_USDC_LAMPORTS - currentUsdcBalance;
                 await spl.mintTo(connection, adminKeypair, usdcMint, userUsdcAccount, admin.publicKey, amountToMint, [], confirmOptions);
                 console.log(`Minted ${amountToMint} USDC lamports to User.`);
            } else {
                 console.log(`User already has sufficient USDC (${currentUsdcBalance} lamports).`);
            }
        }
        // User HAiO should be 0, so no minting

        // Mint NFT (1 mint only) - if already minted, error may occur, check and mint
        const userNftInfo = await connection.getParsedAccountInfo(userNftAccount);
        let currentNftBalance = 0;
        if (userNftInfo.value && userNftInfo.value.data && 'parsed' in userNftInfo.value.data && userNftInfo.value.data.parsed.info) {
            currentNftBalance = userNftInfo.value.data.parsed.info.tokenAmount.uiAmount; // NFT uses uiAmount for precision
        }
        if (currentNftBalance < 1) {
             await spl.mintTo(connection, adminKeypair, userNftMintPubkey, userNftAccount, admin.publicKey, 1, [], confirmOptions);
             console.log(`Minted 1 NFT to User.`);
        } else {
             console.log("User already has the NFT.");
        }


        console.log("--- Setup Complete ---");
    });

    it("Executes the full E2E scenario", async () => {
        // Remove type specification or use IdlAccounts
        let fetchedAgentState;
        let fetchedStakeState;

        // 1. Stake
        console.log("\n--- Step 1: User Stakes NFT ---");
        await stakingProgram.methods
            .stake()
            .accounts({
                userWallet: user.publicKey,
                nftMint: userNftMintPubkey, // use shared NFT mint
                agentState: agentStatePDA,
                nftStakeState: nftStakePDA,
                systemProgram: SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            } as any)
            .signers([user])
            .rpc(confirmOptions);
        console.log("NFT Staked successfully.");
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second wait added


        // state verification
        fetchedAgentState = await agentStateProgram.account.agentState.fetch(agentStatePDA, "finalized");
        assert.isNotNull(fetchedAgentState, "Agent state should exist");
        // *** this part should now pass ***
        assert.isTrue(fetchedAgentState.totalStakedAmount.eq(new BN(1)), `Total staked amount should be 1, found ${fetchedAgentState.totalStakedAmount}`);

        fetchedStakeState = await stakingProgram.account.nftStakeState.fetch(nftStakePDA, "finalized");
        assert.isNotNull(fetchedStakeState, "Stake state should exist");
        assert.isTrue(fetchedStakeState.isStaked, "isStaked should be true");
        assert.equal(fetchedStakeState.agentStateRef?.toBase58(), agentStatePDA.toBase58(), "agentStateRef check"); // agentStateRef verification added

        // 2. Simulate Revenue Transfer (User -> OpWallet) - same as before
        console.log("\n--- Step 2: Simulate Revenue ---");
        console.log(`Transferring ${OP_WALLET_USDC_TRANSFER} USDC lamports from User to OpWallet...`);
        await spl.transfer( connection, user, userUsdcAccount, opWalletUsdcAccount, user, OP_WALLET_USDC_TRANSFER, [], confirmOptions );
        console.log(`Sent ${Number(OP_WALLET_USDC_TRANSFER) / (10**USDC_DECIMALS)} USDC to OpW.`);
        let opwUsdcAcc = await spl.getAccount(provider.connection, opWalletUsdcAccount);
        assert.equal(opwUsdcAcc.amount.toString(), OP_WALLET_USDC_TRANSFER.toString(), "OpW USDC balance check");

        // --- Worker Simulation --- (same as before, uses shared Mint/ATA)
        console.log("\n--- Step 3: Worker Processing ---");
        // 3.1 Swap USDC for HAiO
        console.log("Worker: Swapping USDC for HAiO...");
        await mockSwapProgram.methods
            .swapUsdcForHaio(new BN(OP_WALLET_USDC_TRANSFER.toString()))
            .accounts({
                userOrOpWallet: operationalWallet.publicKey,
                swapAdminAuthority: admin.publicKey,
                userUsdcAccount: opWalletUsdcAccount, // OpW's USDC account
                userHaioAccount: opWalletHaioAccount, // OpW's HAiO account
                usdcVault: usdcVaultPDA,
                haioVault: haioVaultPDA,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            } as any)
            .signers([operationalWallet, adminKeypair]) // OpW and Admin signers needed
            .rpc(confirmOptions);

        let opwHaioAcc = await spl.getAccount(provider.connection, opWalletHaioAccount);
        const expectedHaioOutMin = new BN(OP_WALLET_USDC_TRANSFER.toString()).mul(new BN(SWAP_RATE_HAIO_PER_USDC)).mul(new BN(10).pow(new BN(HAIO_DECIMALS))).div(new BN(10).pow(new BN(USDC_DECIMALS)));
        assert.isTrue(new BN(opwHaioAcc.amount.toString()).gte(expectedHaioOutMin), `OpW HAiO balance check after swap. Expected >= ${expectedHaioOutMin}, Got ${opwHaioAcc.amount}`);
        console.log(`Worker: Swapped for ~${Number(opwHaioAcc.amount) / (10**HAIO_DECIMALS)} HAiO.`);

        // 3.2 Burn HAiO
        console.log("Worker: Burning some HAiO...");
        const currentHaioBN = new BN(opwHaioAcc.amount.toString());
        const burnAmountBN = currentHaioBN.div(new BN(OP_WALLET_HAIO_BURN_DIVISOR.toString()));
        if (burnAmountBN.gtn(0)) {
            await spl.burn( connection, operationalWallet, opWalletHaioAccount, haioMint, operationalWallet, BigInt(burnAmountBN.toString()), [], confirmOptions ); // use shared haioMint
            console.log(`Worker: Burned ${Number(burnAmountBN) / (10**HAIO_DECIMALS)} HAiO.`);
        } else { console.log("Worker: Burn amount is zero, skipping burn."); }

        // 3.3 Transfer Net HAiO to Revenue Safe
        console.log("Worker: Transferring remaining HAiO to Revenue Safe...");
        opwHaioAcc = await spl.getAccount(provider.connection, opWalletHaioAccount); // check balance again
        const transferAmountBigInt = opwHaioAcc.amount;
        if (transferAmountBigInt > 0) {
            // revenueSafeATA is calculated based on haioMint, so correct
            await spl.transfer( connection, operationalWallet, opWalletHaioAccount, revenueSafeATA, operationalWallet, transferAmountBigInt, [], confirmOptions );
            console.log(`Worker: Transferred ${Number(transferAmountBigInt) / (10**HAIO_DECIMALS)} HAiO to Revenue Safe ${revenueSafeATA.toBase58()}.`);
        } else { console.log("Worker: No HAiO left to transfer to Revenue Safe."); }

        // 4. Distribute Revenue (same as before, uses shared ATA)
        console.log("\n--- Step 4: Distribute Revenue ---");
        const agentStateBeforeDist = await agentStateProgram.account.agentState.fetch(agentStatePDA);
        const revenueSafeBalanceBefore = (await spl.getAccount(provider.connection, revenueSafeATA)).amount;
        console.log(`Revenue Safe Balance before distribution: ${Number(revenueSafeBalanceBefore) / (10**HAIO_DECIMALS)} HAiO`);
        assert.ok(revenueSafeBalanceBefore > 0, "Revenue safe should have received tokens");

        await agentStateProgram.methods
            .distributeRevenue()
            .accounts({
                agentState: agentStatePDA,
                agentRevenueSafe: revenueSafeATA,
                rewardPoolPda: rewardPoolATA,
                daoTreasuryPda: daoTreasuryATA,         // Correct ATA derived from AgentState PDA
                developerTreasuryPda: developerTreasuryATA, // Correct ATA derived from AgentState PDA
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            } as any)
            // distributeRevenue does not need separate signer as PDA is authority (agent_state authority role)
            .rpc(confirmOptions);
        console.log("Revenue Distributed.");

        const agentStateAfterDist = await agentStateProgram.account.agentState.fetch(agentStatePDA);
        const rewardPoolAcc = await spl.getAccount(provider.connection, rewardPoolATA);
        const daoTreasuryAcc = await spl.getAccount(provider.connection, daoTreasuryATA);
        const devTreasuryAcc = await spl.getAccount(provider.connection, developerTreasuryATA); // Dev Treasury balance check
        const revenueSafeBalanceAfter = (await spl.getAccount(provider.connection, revenueSafeATA)).amount;

        assert.ok(agentStateAfterDist.rewardPerTokenCumulative.gt(agentStateBeforeDist.rewardPerTokenCumulative), "Cumulative reward rate should increase");
        assert.equal(revenueSafeBalanceAfter.toString(), "0", "Revenue Safe should be empty after distribution");

        // distribution ratio calculation and verification
        const stakingShare = new BN(revenueSafeBalanceBefore.toString()).mul(new BN(STAKING_RATIO_BPS)).div(new BN(10000));
        const daoShare = new BN(revenueSafeBalanceBefore.toString()).mul(new BN(DAO_RATIO_BPS)).div(new BN(10000));
        const devShare = new BN(revenueSafeBalanceBefore.toString()).mul(new BN(DEVELOPER_RATIO_BPS)).div(new BN(10000));

        assert.equal(rewardPoolAcc.amount.toString(), stakingShare.toString(), "Reward Pool balance check");
        // DAO and Dev Treasury use same ATA, so total amount verification
        assert.equal(daoTreasuryAcc.amount.toString(), daoShare.add(devShare).toString(), "DAO + Dev Treasury balance check");
        // assert.equal(devTreasuryAcc.amount.toString(), devShare.toString(), "Developer Treasury balance check"); // separate ATA would verify this way

        // 5. Claim Rewards (same as before, uses shared ATA/PDA)
        console.log("\n--- Step 5: User Claims Rewards ---");
        const initialUserHaioBalance = (await spl.getAccount(provider.connection, userHaioAccount)).amount;
        await stakingProgram.methods
            .claimRewards()
            .accounts({
                userWallet: user.publicKey,
                userHaioAccount: userHaioAccount,
                agentState: agentStatePDA,
                nftStakeState: nftStakePDA,
                rewardPoolPda: rewardPoolATA,
                rewardPoolAuthority: rewardPoolAuthorityPDA,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            } as any)
            .signers([user])
            .rpc(confirmOptions);
        console.log("Rewards Claimed.");

        const finalUserHaioBalance = (await spl.getAccount(provider.connection, userHaioAccount)).amount;
        const stakeStateAfterClaim = await stakingProgram.account.nftStakeState.fetch(nftStakePDA);
        assert.isTrue(new BN(finalUserHaioBalance.toString()).gt(new BN(initialUserHaioBalance.toString())), `User HAiO balance should increase after claim. Before: ${initialUserHaioBalance}, After: ${finalUserHaioBalance}`);
        assert.isNotNull(stakeStateAfterClaim, "Stake state should still exist after claim");
        assert.equal(stakeStateAfterClaim.rewardDebt.toString(), agentStateAfterDist.rewardPerTokenCumulative.toString(), "Reward debt should be updated to latest cumulative rate");

        // 6. Unstake
        console.log("\n--- Step 6: User Unstakes NFT ---");
        const userHaioBalanceBeforeUnstake = finalUserHaioBalance;
        const agentStateBeforeUnstake = await agentStateProgram.account.agentState.fetch(agentStatePDA);
        const initialTotalStaked = agentStateBeforeUnstake.totalStakedAmount;

        // unstake call uses userNftMintPubkey
        await stakingProgram.methods
            .unstake()
            .accounts({
                userWallet: user.publicKey,
                nftMint: userNftMintPubkey, // use shared NFT mint
                userHaioAccount: userHaioAccount,
                agentStateMut: agentStatePDA, // agent_state_mut field name used (Rust code basis)
                // agentState: agentStatePDA, // Rust code removed
                nftStakeState: nftStakePDA,
                rewardPoolPda: rewardPoolATA,
                rewardPoolAuthority: rewardPoolAuthorityPDA,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            } as any)
            .signers([user])
            .rpc(confirmOptions);
        console.log("NFT Unstaked successfully.");

        const agentStateAfterUnstake = await agentStateProgram.account.agentState.fetch(agentStatePDA);
        const userHaioBalanceAfterUnstake = (await spl.getAccount(provider.connection, userHaioAccount)).amount;
        assert.isNotNull(agentStateAfterUnstake, "Agent state should still exist");
        assert.equal(agentStateAfterUnstake.totalStakedAmount.toString(), initialTotalStaked.sub(new BN(1)).toString(), "Total staked amount should decrease by 1");
        // Unstake point may have additional reward, so >= comparison
        assert.isTrue(new BN(userHaioBalanceAfterUnstake.toString()).gte(new BN(userHaioBalanceBeforeUnstake.toString())), "User HAiO balance should not decrease on unstake");

        // Stake account close verification
        try {
            await stakingProgram.account.nftStakeState.fetch(nftStakePDA);
            assert.fail("Stake state account should be closed and fetching should fail");
        } catch (e: any) {
            // Different error message may occur based on Anchor/Web3.js version
            assert.include(e.message, "Account does not exist", "nftStakeState account should be closed");
            // or assert.instanceOf(e, Error); alternative
            console.log("Stake state account successfully closed.");
        }

        console.log("\n--- E2E Test Completed Successfully ---");
    });
});