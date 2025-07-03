#!/bin/bash

# --- Variable Settings ---
KEYPAIR_DIR="keypairs"
ADMIN_KEYPAIR_PATH="${KEYPAIR_DIR}/id.json"
OP_WALLET_KEYPAIR_PATH="${KEYPAIR_DIR}/op-wallet.json"
EXTERNAL_WALLET_KEYPAIR_PATH="${KEYPAIR_DIR}/external.json"
USER_WALLET_KEYPAIR_PATH="${KEYPAIR_DIR}/haio-user.json"
AETHIR_PAYMENT_WALLET_KEYPAIR_PATH="${KEYPAIR_DIR}/aethir-wallet.json"
DAO_TREASURY_AUTHORITY_KEYPAIR_PATH="${KEYPAIR_DIR}/dao-treasury-authority.json"
DEVELOPER_TREASURY_AUTHORITY_KEYPAIR_PATH="${KEYPAIR_DIR}/dev-treasury-authority.json"

USDC_MINT_KEYPAIR_PATH="${KEYPAIR_DIR}/usdc-mint.json"
HAIO_MINT_KEYPAIR_PATH="${KEYPAIR_DIR}/haio-mint.json"
NFT_MINT_KEYPAIR_PATH="${KEYPAIR_DIR}/nft-mint.json"
ATH_MINT_KEYPAIR_PATH="${KEYPAIR_DIR}/ath-mint.json"

AIRDROP_AMOUNT=5        # Amount of SOL to airdrop to Admin wallet (should be enough)
TRANSFER_AMOUNT=0.2     # Amount of SOL to transfer to other wallets

# --- Script Start ---
echo "--- HAiO Devnet Initial Setup Script ---"

# 1. Create keypairs directory (if not exists)
mkdir -p "${KEYPAIR_DIR}"
echo "[1/5] Ensured '${KEYPAIR_DIR}' directory exists."

# 2. Generate all required keypair files
# Note: Existing files will be overwritten. Backup important keys in advance!
echo "[2/5] Generating required keypairs (overwrites existing files)..."
solana-keygen new --outfile "${ADMIN_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${OP_WALLET_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${EXTERNAL_WALLET_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${USER_WALLET_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${AETHIR_PAYMENT_WALLET_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${DAO_TREASURY_AUTHORITY_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${DEVELOPER_TREASURY_AUTHORITY_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${USDC_MINT_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${HAIO_MINT_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${NFT_MINT_KEYPAIR_PATH}" --no-bip39-passphrase
solana-keygen new --outfile "${ATH_MINT_KEYPAIR_PATH}" --no-bip39-passphrase
echo " -> All keypairs generated in '${KEYPAIR_DIR}' directory."
echo " !!! IMPORTANT: Backup the '${KEYPAIR_DIR}' directory, especially '${ADMIN_KEYPAIR_PATH}' and '${OP_WALLET_KEYPAIR_PATH}' !!!"
echo " !!! Ensure '${KEYPAIR_DIR}/*' is added to your .gitignore file !!!"

# 3. Airdrop Devnet SOL to Admin wallet (id.json)
echo "[3/5] Requesting ${AIRDROP_AMOUNT} SOL airdrop for Admin Wallet (${ADMIN_KEYPAIR_PATH})..."
ADMIN_PUBKEY=$(solana-keygen pubkey "${ADMIN_KEYPAIR_PATH}")
solana airdrop ${AIRDROP_AMOUNT} "${ADMIN_PUBKEY}" --url devnet
# Wait a moment for the airdrop to be processed (time may vary depending on network conditions)
echo " -> Waiting for a moment for the airdrop to be processed..."
sleep 5

# Check Admin wallet balance
echo " -> Current Admin Wallet Balance: ${ADMIN_BALANCE}"
# Check minimum required SOL (approximate value)
MIN_NEEDED_SOL=$(echo "$TRANSFER_AMOUNT * 4 + 0.1" | bc) # 4 transfers + some margin
echo " -> Estimated minimum SOL needed in Admin Wallet: ~${MIN_NEEDED_SOL} SOL (for transfers)"
# In practice, more SOL may be needed (for deployment, initialization, etc.)
# if [[ $(echo "$(solana balance ${ADMIN_PUBKEY} --url devnet --output json | jq -r . | cut -d' ' -f1) < $MIN_NEEDED_SOL" | bc) -eq 1 ]]; then
#     echo " -> ERROR: Admin wallet SOL balance might be insufficient after airdrop. Please check and request more if needed."
#     # exit 1 # Stop if necessary
# fi

# 4. Transfer required SOL from Admin wallet to other wallets
echo "[4/5] Transferring ${TRANSFER_AMOUNT} SOL from Admin to other wallets..."

# List of target wallets (wallets that need SOL)
declare -a TARGET_WALLETS=(
    "${OP_WALLET_KEYPAIR_PATH}"
    "${EXTERNAL_WALLET_KEYPAIR_PATH}"
    "${USER_WALLET_KEYPAIR_PATH}"
    "${AETHIR_PAYMENT_WALLET_KEYPAIR_PATH}"
)

# Execute transfers
for WALLET_PATH in "${TARGET_WALLETS[@]}"; do
    WALLET_PUBKEY=$(solana-keygen pubkey "${WALLET_PATH}")
    echo " -> Transferring ${TRANSFER_AMOUNT} SOL to ${WALLET_PATH} (${WALLET_PUBKEY})..."
    solana transfer --from "${ADMIN_KEYPAIR_PATH}" "${WALLET_PUBKEY}" ${TRANSFER_AMOUNT} --url devnet --fee-payer "${ADMIN_KEYPAIR_PATH}" --allow-unfunded-recipient --skip-seed-phrase-validation
    # Short delay between transfers (Devnet load consideration)
    sleep 1
done
echo " -> SOL transfers initiated."

# 5. Verify final SOL balances (for reference)
echo "[5/5] Verifying final SOL balances (approximate)..."
sleep 3 # Wait a moment before final verification
for WALLET_PATH in "${TARGET_WALLETS[@]}"; do
    WALLET_PUBKEY=$(solana-keygen pubkey "${WALLET_PATH}")
    BALANCE=$(solana balance "${WALLET_PUBKEY}" --url devnet)
    echo " -> Balance for ${WALLET_PATH}: ${BALANCE}"
done
ADMIN_BALANCE_FINAL=$(solana balance "${ADMIN_PUBKEY}" --url devnet)
echo " -> Final Admin Wallet Balance: ${ADMIN_BALANCE_FINAL}"

echo "--- Setup Script Finished ---"