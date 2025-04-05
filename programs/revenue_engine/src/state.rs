use anchor_lang::prelude::*;

#[account]
pub struct EngineState {
    pub authority: Pubkey, 
    pub revenue_safe: Pubkey,
    pub reward_pool_pda: Pubkey, 
    pub dao_treasury_pda: Pubkey, 
    pub developer_treasury_pda: Pubkey, 
    pub staking_ratio_bps: u16, 
    pub dao_ratio_bps: u16,  
    pub developer_ratio_bps: u16, 
    pub total_staked_amount: u64, 
    pub reward_per_token_cumulative: u128, 
    pub last_distribution_timestamp: i64, 
    pub bump: u8,            
}

impl EngineState {
    pub const MAX_SIZE: usize = 8  // Discriminator
        + 32 // authority
        + 32 // revenue_safe
        + 32 // reward_pool_pda
        + 32 // dao_treasury_pda
        + 32 // developer_treasury_pda
        + 2  // staking_ratio_bps
        + 2  // dao_ratio_bps
        + 2  // developer_ratio_bps
        + 8  // total_staked_amount
        + 16 // reward_per_token_cumulative (u128)
        + 8  // last_distribution_timestamp
        + 1; // bump
}
