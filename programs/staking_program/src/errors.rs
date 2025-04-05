use anchor_lang::prelude::*;

#[error_code]
pub enum StakingError {
    #[msg("NFT is not staked or does not belong to the user.")]
    NftNotStaked,
    #[msg("Caller is not authorized to perform this action.")]
    Unauthorized,
    #[msg("No rewards available to claim.")]
    NoRewardsToClaim,
    #[msg("Calculation overflow error.")]
    CalculationError,
}
