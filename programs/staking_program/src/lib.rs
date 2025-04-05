pub mod errors;
pub mod state;

use crate::errors::StakingError;
use crate::state::NftStakeState;
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use revenue_engine::program::RevenueEngine;
use revenue_engine::state::EngineState;

declare_id!("DNEYpF5jMNjpxAPNYQhPkpuaxWGudBTvyrmKDkNQdZMP");

const PRECISION: u128 = 1_000_000_000_000;

use revenue_engine::ID as REVENUE_ENGINE_PROGRAM_ID;

#[program]
pub mod staking_program {
    use super::*;

    pub fn stake(ctx: Context<StakeNft>) -> Result<()> {
        let stake_state = &mut ctx.accounts.nft_stake_state;
        let engine_state_info = &ctx.accounts.engine_state;

        require_keys_eq!(
            *engine_state_info.owner,
            REVENUE_ENGINE_PROGRAM_ID,
            StakingError::Unauthorized
        );

        let engine_state_data = engine_state_info.try_borrow_data()?;
        let current_engine_state = EngineState::try_deserialize(&mut &engine_state_data[..])?;
        drop(engine_state_data);

        stake_state.user_wallet = ctx.accounts.user_wallet.key();
        stake_state.nft_mint = ctx.accounts.nft_mint.key();
        stake_state.staked_amount = 1;
        stake_state.last_staked_timestamp = Clock::get()?.unix_timestamp;
        stake_state.is_staked = true;
        stake_state.reward_debt = current_engine_state.reward_per_token_cumulative;
        stake_state.bump = ctx.bumps.nft_stake_state;
        stake_state.engine_state_ref = engine_state_info.key();

        let cpi_program = ctx.accounts.revenue_engine_program.to_account_info();
        let cpi_accounts = revenue_engine::cpi::accounts::UpdateTotalStaked {
            engine_state: ctx.accounts.engine_state.to_account_info(),
            caller_program: ctx.accounts.staking_program_executable.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        revenue_engine::cpi::increase_total_staked(cpi_ctx, 1)?;

        msg!("NFT staked: {}", stake_state.nft_mint);
        Ok(())
    }

    pub fn unstake(ctx: Context<UnstakeNft>) -> Result<()> {
        let stake_state = &ctx.accounts.nft_stake_state;
        let engine_state_info = &ctx.accounts.engine_state;

        require_keys_eq!(
            *engine_state_info.owner,
            REVENUE_ENGINE_PROGRAM_ID,
            StakingError::Unauthorized
        );

        let engine_state_data_read = engine_state_info.try_borrow_data()?;
        let current_engine_state_read =
            EngineState::try_deserialize(&mut &engine_state_data_read[..])?;
        drop(engine_state_data_read);

        require!(stake_state.is_staked, StakingError::NftNotStaked);
        require_keys_eq!(
            stake_state.user_wallet,
            ctx.accounts.user_wallet.key(),
            StakingError::Unauthorized
        );

        let claimable_reward =
            calculate_rewards_from_state(&current_engine_state_read, stake_state)?;

        if claimable_reward > 0 {
            msg!("Claiming {} rewards on unstake", claimable_reward);
            let authority_bump = ctx.bumps.reward_pool_authority;
            let seeds = &[
                b"reward_pool_authority_seed".as_ref(),
                &[authority_bump][..],
            ];
            let signer_seeds = &[&seeds[..]];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.reward_pool_pda.to_account_info(),
                        to: ctx.accounts.user_haio_account.to_account_info(),
                        authority: ctx.accounts.reward_pool_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                claimable_reward,
            )?;
        }

        let cpi_program = ctx.accounts.revenue_engine_program.to_account_info();
        let cpi_accounts = revenue_engine::cpi::accounts::UpdateTotalStaked {
            engine_state: ctx.accounts.engine_state.to_account_info(),
            caller_program: ctx.accounts.staking_program_executable.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        revenue_engine::cpi::decrease_total_staked(cpi_ctx, 1)?;

        msg!("NFT unstaked: {}", stake_state.nft_mint);
        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let stake_state = &mut ctx.accounts.nft_stake_state;
        let engine_state_info = &ctx.accounts.engine_state;

        require_keys_eq!(
            *engine_state_info.owner,
            REVENUE_ENGINE_PROGRAM_ID,
            StakingError::Unauthorized
        );

        let engine_state_data = engine_state_info.try_borrow_data()?;
        let current_engine_state = EngineState::try_deserialize(&mut &engine_state_data[..])?;
        drop(engine_state_data);

        require!(stake_state.is_staked, StakingError::NftNotStaked);
        require_keys_eq!(
            stake_state.user_wallet,
            ctx.accounts.user_wallet.key(),
            StakingError::Unauthorized
        );

        let claimable_reward = calculate_rewards_from_state(&current_engine_state, stake_state)?;
        require!(claimable_reward > 0, StakingError::NoRewardsToClaim);

        let authority_bump = ctx.bumps.reward_pool_authority;
        let seeds = &[
            b"reward_pool_authority_seed".as_ref(),
            &[authority_bump][..],
        ];
        let signer_seeds = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.reward_pool_pda.to_account_info(),
                    to: ctx.accounts.user_haio_account.to_account_info(),
                    authority: ctx.accounts.reward_pool_authority.to_account_info(),
                },
                signer_seeds,
            ),
            claimable_reward,
        )?;

        stake_state.reward_debt = current_engine_state.reward_per_token_cumulative;
        msg!(
            "Claimed {} HAiO rewards by {}",
            claimable_reward,
            stake_state.user_wallet
        );
        Ok(())
    }
}

fn calculate_rewards_from_state(
    engine_state: &EngineState,
    stake_state: &Account<NftStakeState>,
) -> Result<u64> {
    let current = engine_state.reward_per_token_cumulative;
    let last = stake_state.reward_debt;
    if current <= last {
        return Ok(0);
    }
    let diff = current
        .checked_sub(last)
        .ok_or(StakingError::CalculationError)?;
    let reward = diff
        .checked_mul(stake_state.staked_amount as u128)
        .and_then(|r| r.checked_div(PRECISION))
        .ok_or(StakingError::CalculationError)?;
    require!(reward <= u64::MAX as u128, StakingError::CalculationError);
    Ok(reward as u64)
}

#[derive(Accounts)]
pub struct StakeNft<'info> {
    #[account(mut)]
    pub user_wallet: Signer<'info>,
    pub nft_mint: Account<'info, Mint>,

    /// CHECK: Engine State Account. Marked mut for CPI call. Owner check done in handler.
    #[account(mut, owner = REVENUE_ENGINE_PROGRAM_ID)]
    pub engine_state: AccountInfo<'info>,

    #[account(address = REVENUE_ENGINE_PROGRAM_ID)]
    pub revenue_engine_program: Program<'info, RevenueEngine>,

    #[account(
        init,
        payer = user_wallet,
        space = 8 + NftStakeState::MAX_SIZE,
        seeds = [b"nft_stake", user_wallet.key().as_ref(), nft_mint.key().as_ref()],
        bump
    )]
    pub nft_stake_state: Account<'info, NftStakeState>,

    /// CHECK: Staking program's executable ID
    #[account(executable, address = crate::ID)]
    pub staking_program_executable: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnstakeNft<'info> {
    #[account(mut)]
    pub user_wallet: Signer<'info>,

    #[account(address = nft_stake_state.nft_mint)]
    pub nft_mint: Account<'info, Mint>,

    #[account(mut)]
    pub user_haio_account: Account<'info, TokenAccount>,

    /// CHECK: Engine State Account. Marked mut for CPI call. Owner check done in handler.
    #[account(mut, owner = REVENUE_ENGINE_PROGRAM_ID, address = nft_stake_state.engine_state_ref)]
    // Owner 검증 추가
    pub engine_state: AccountInfo<'info>,

    #[account(address = REVENUE_ENGINE_PROGRAM_ID)]
    pub revenue_engine_program: Program<'info, RevenueEngine>,

    #[account(
        mut,
        close = user_wallet,
        seeds = [b"nft_stake", user_wallet.key().as_ref(), nft_mint.key().as_ref()],
        bump = nft_stake_state.bump,
        has_one = user_wallet,
        has_one = nft_mint,
    )]
    pub nft_stake_state: Account<'info, NftStakeState>,

    #[account(address = nft_stake_state.engine_state_ref)]
    pub engine_state_loader: Account<'info, EngineState>,

    #[account(mut, address = engine_state_loader.reward_pool_pda)]
    pub reward_pool_pda: Account<'info, TokenAccount>,

    /// CHECK: Reward Pool Authority PDA
    #[account(seeds = [b"reward_pool_authority_seed"], bump)]
    pub reward_pool_authority: AccountInfo<'info>,

    /// CHECK: Staking program's executable ID
    #[account(executable, address = crate::ID)]
    pub staking_program_executable: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub user_wallet: Signer<'info>,

    #[account(mut)]
    pub user_haio_account: Account<'info, TokenAccount>,

    /// CHECK: Engine State Account (must be owned by RevenueEngine program)
    #[account(owner = REVENUE_ENGINE_PROGRAM_ID, address = nft_stake_state.engine_state_ref)]
    pub engine_state: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [b"nft_stake", user_wallet.key().as_ref(), nft_stake_state.nft_mint.as_ref()],
        bump = nft_stake_state.bump,
        has_one = user_wallet
    )]
    pub nft_stake_state: Account<'info, NftStakeState>,

    #[account(address = nft_stake_state.engine_state_ref)]
    pub engine_state_loader: Account<'info, EngineState>,

    #[account(mut, address = engine_state_loader.reward_pool_pda)]
    pub reward_pool_pda: Account<'info, TokenAccount>,

    /// CHECK: Reward Pool Authority PDA
    #[account(seeds = [b"reward_pool_authority_seed"], bump)]
    pub reward_pool_authority: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
}
