use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;

#[account]
pub struct NftStakeState {
    pub user_wallet: Pubkey,
    pub nft_mint: Pubkey,
    pub staked_amount: u64,
    pub reward_debt: u128,
    pub last_staked_timestamp: i64,
    pub is_staked: bool,
    pub bump: u8,
    pub engine_state_ref: Pubkey,
}

impl NftStakeState {
    pub const MAX_SIZE: usize = 8  // Discriminator
        + 32                       // user_wallet
        + 32                       // nft_mint
        + 8                        // staked_amount
        + 16                       // reward_debt (u128)
        + 8                        // last_staked_timestamp
        + 1                        // is_staked (bool)
        + 1                        // bump
        + 32; // agent_state_ref
}
