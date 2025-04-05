#!/bin/bash

# --- 변수 설정 ---
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

AIRDROP_AMOUNT=5        # Admin 지갑에 에어드랍할 SOL 양 (충분히)
TRANSFER_AMOUNT=0.2     # 다른 지갑으로 전송할 SOL 양

# --- 스크립트 시작 ---
echo "--- HAiO Devnet Initial Setup Script ---"

# 1. keypairs 디렉토리 생성 (없으면)
mkdir -p "${KEYPAIR_DIR}"
echo "[1/5] Ensured '${KEYPAIR_DIR}' directory exists."

# 2. 모든 필수 키페어 파일 생성
# 주의: 이미 파일이 존재하면 덮어씁니다. 중요한 키는 미리 백업하세요!
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

# 3. Admin 지갑(id.json)에 Devnet SOL 에어드랍
echo "[3/5] Requesting ${AIRDROP_AMOUNT} SOL airdrop for Admin Wallet (${ADMIN_KEYPAIR_PATH})..."
ADMIN_PUBKEY=$(solana-keygen pubkey "${ADMIN_KEYPAIR_PATH}")
solana airdrop ${AIRDROP_AMOUNT} "${ADMIN_PUBKEY}" --url devnet
# 에어드랍이 처리될 때까지 잠시 대기 (네트워크 상황에 따라 시간 필요)
echo " -> Waiting for a moment for the airdrop to be processed..."
sleep 5

# Admin 잔액 확인
ADMIN_BALANCE=$(solana balance "${ADMIN_PUBKEY}" --url devnet)
echo " -> Current Admin Wallet Balance: ${ADMIN_BALANCE}"
# 최소 필요 SOL 확인 (대략적인 값)
MIN_NEEDED_SOL=$(echo "$TRANSFER_AMOUNT * 4 + 0.1" | bc) # 4번 전송 + 약간의 여유
echo " -> Estimated minimum SOL needed in Admin Wallet: ~${MIN_NEEDED_SOL} SOL (for transfers)"
# 실제로는 더 많은 SOL이 필요할 수 있습니다 (배포, 초기화 등)
# if [[ $(echo "$(solana balance ${ADMIN_PUBKEY} --url devnet --output json | jq -r . | cut -d' ' -f1) < $MIN_NEEDED_SOL" | bc) -eq 1 ]]; then
#     echo " -> ERROR: Admin wallet SOL balance might be insufficient after airdrop. Please check and request more if needed."
#     # exit 1 # 필요시 중단
# fi

# 4. Admin 지갑에서 다른 필요 지갑으로 SOL 전송
echo "[4/5] Transferring ${TRANSFER_AMOUNT} SOL from Admin to other wallets..."

# 대상 지갑 목록 (SOL이 필요한 지갑)
declare -a TARGET_WALLETS=(
    "${OP_WALLET_KEYPAIR_PATH}"
    "${EXTERNAL_WALLET_KEYPAIR_PATH}"
    "${USER_WALLET_KEYPAIR_PATH}"
    "${AETHIR_PAYMENT_WALLET_KEYPAIR_PATH}"
)

# 전송 실행
for WALLET_PATH in "${TARGET_WALLETS[@]}"; do
    WALLET_PUBKEY=$(solana-keygen pubkey "${WALLET_PATH}")
    echo " -> Transferring ${TRANSFER_AMOUNT} SOL to ${WALLET_PATH} (${WALLET_PUBKEY})..."
    solana transfer --from "${ADMIN_KEYPAIR_PATH}" "${WALLET_PUBKEY}" ${TRANSFER_AMOUNT} --url devnet --fee-payer "${ADMIN_KEYPAIR_PATH}" --allow-unfunded-recipient --skip-seed-phrase-validation
    # 전송 간 약간의 딜레이 (Devnet 부하 고려)
    sleep 1
done
echo " -> SOL transfers initiated."

# 5. 최종 잔액 확인 (참고용)
echo "[5/5] Verifying final SOL balances (approximate)..."
sleep 3 # 최종 확인 전 잠시 대기
for WALLET_PATH in "${TARGET_WALLETS[@]}"; do
    WALLET_PUBKEY=$(solana-keygen pubkey "${WALLET_PATH}")
    BALANCE=$(solana balance "${WALLET_PUBKEY}" --url devnet)
    echo " -> Balance for ${WALLET_PATH}: ${BALANCE}"
done
ADMIN_BALANCE_FINAL=$(solana balance "${ADMIN_PUBKEY}" --url devnet)
echo " -> Final Admin Wallet Balance: ${ADMIN_BALANCE_FINAL}"

echo "--- Setup Script Finished ---"