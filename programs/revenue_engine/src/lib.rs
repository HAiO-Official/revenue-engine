pub mod state;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use crate::state::EngineState;

declare_id!("E2KG7u7hZnRPVF56hc3hpqMKnBiBUWVgwbqpHJNQWmNV");

const PRECISION: u128 = 1_000_000_000_000; // 10^12

const STAKING_PROGRAM_ID_STR: &str = "EWmrkAfChNnuhCm5nbfwZMwuhn3PN8nF4bfTX9GuyDdQ";

#[program]
pub mod revenue_engine {
    use super::*;

    pub fn initialize_engine_state(
        ctx: Context<InitializeEngineState>,
        staking_ratio_bps: u16,
        dao_ratio_bps: u16,
        developer_ratio_bps: u16,
    ) -> Result<()> {
        let engine_state = &mut ctx.accounts.engine_state;
        engine_state.authority = ctx.accounts.authority.key();
        engine_state.revenue_safe = ctx.accounts.revenue_safe.key();
        engine_state.reward_pool_pda = ctx.accounts.reward_pool_pda.key();
        engine_state.dao_treasury_pda = ctx.accounts.dao_treasury_pda.key();
        engine_state.developer_treasury_pda = ctx.accounts.developer_treasury_pda.key();

        let total_ratio = staking_ratio_bps.checked_add(dao_ratio_bps)
                            .and_then(|sum| sum.checked_add(developer_ratio_bps))
                            .ok_or(ErrorCode::CalculationError)?;
        require!(total_ratio <= 10000, ErrorCode::InvalidRatioSum);

        engine_state.staking_ratio_bps = staking_ratio_bps;
        engine_state.dao_ratio_bps = dao_ratio_bps;
        engine_state.developer_ratio_bps = developer_ratio_bps;
        engine_state.total_staked_amount = 0;
        engine_state.reward_per_token_cumulative = 0;
        engine_state.last_distribution_timestamp = 0;
        engine_state.bump = ctx.bumps.engine_state;

        msg!("Global Revenue Engine state initialized.");
        Ok(())
    }

    pub fn distribute_revenue(ctx: Context<DistributeRevenue>) -> Result<()> {
        let engine_state = &mut ctx.accounts.engine_state;
        msg!("Distribute function accessing EngineState PDA: {}", engine_state.key());

        engine_state.reload()?;
        ctx.accounts.revenue_safe.reload()?;

        let revenue_amount = ctx.accounts.revenue_safe.amount;
        msg!("Distributing {} HAiO from Revenue Safe {}", revenue_amount, engine_state.revenue_safe);

        if revenue_amount == 0 {
            msg!("Revenue Safe is empty.");
            return Ok(());
        }

        let total_staked = engine_state.total_staked_amount;
        msg!("Current total_staked_amount: {}", total_staked);

        let staker_reward_total = (revenue_amount as u128 * engine_state.staking_ratio_bps as u128 / 10000) as u64;
        let dao_reward_total = (revenue_amount as u128 * engine_state.dao_ratio_bps as u128 / 10000) as u64;
        let developer_reward_total = (revenue_amount as u128 * engine_state.developer_ratio_bps as u128 / 10000) as u64;

        let distributed_total = staker_reward_total.checked_add(dao_reward_total).and_then(|sum| sum.checked_add(developer_reward_total)).ok_or(ErrorCode::CalculationError)?;
        require!(distributed_total <= revenue_amount, ErrorCode::CalculationError);
        let remaining_in_safe = revenue_amount.saturating_sub(distributed_total);

        msg!(
            "Calculated distribution: Staker={}, DAO={}, Dev={}, TotalDist={}, Remaining={}",
            staker_reward_total, dao_reward_total, developer_reward_total, distributed_total, remaining_in_safe
        );

        let bump_seed = &[engine_state.bump];
        let seeds = &[ b"engine_state_v1".as_ref(), bump_seed.as_ref() ];
        let signer_seeds = &[&seeds[..]];

        if staker_reward_total > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer { from: ctx.accounts.revenue_safe.to_account_info(), to: ctx.accounts.reward_pool_pda.to_account_info(), authority: engine_state.to_account_info(), },
                    signer_seeds
                ), staker_reward_total)?;
            msg!(" -> Sent {} to Reward Pool PDA", staker_reward_total);
        }
        if dao_reward_total > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer { from: ctx.accounts.revenue_safe.to_account_info(), to: ctx.accounts.dao_treasury_pda.to_account_info(), authority: engine_state.to_account_info(), },
                    signer_seeds
                ), dao_reward_total)?;
             msg!(" -> Sent {} to DAO Treasury PDA.", dao_reward_total);
        }
        if developer_reward_total > 0 {
             token::transfer(
                 CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer { from: ctx.accounts.revenue_safe.to_account_info(), to: ctx.accounts.developer_treasury_pda.to_account_info(), authority: engine_state.to_account_info(), },
                    signer_seeds
                 ), developer_reward_total)?;
             msg!(" -> Sent {} to Developer Treasury PDA.", developer_reward_total);
        }

        if total_staked > 0 && staker_reward_total > 0 {
             let delta_reward_per_token = (staker_reward_total as u128).checked_mul(PRECISION)
                                          .and_then(|v| v.checked_div(total_staked as u128))
                                          .ok_or(ErrorCode::CalculationError)?;
             engine_state.reward_per_token_cumulative = engine_state.reward_per_token_cumulative
                                         .checked_add(delta_reward_per_token)
                                         .ok_or(ErrorCode::CalculationError)?;
             msg!("Updated global reward rate: {}", engine_state.reward_per_token_cumulative);
        } else { msg!("Staked amount is zero or no reward for stakers this period. Rate not updated."); }

        engine_state.last_distribution_timestamp = Clock::get()?.unix_timestamp;
        msg!("Distribution finished.");
        Ok(())
    }

    pub fn increase_total_staked(ctx: Context<UpdateTotalStaked>, amount: u64) -> Result<()> {
        msg!("CPI: increase_total_staked (amount: {}) called by: {}", amount, ctx.accounts.caller_program.key());
        let engine_state = &mut ctx.accounts.engine_state;
        engine_state.total_staked_amount = engine_state.total_staked_amount
            .checked_add(amount).ok_or(ErrorCode::CalculationError)?;
        msg!("New total_staked_amount: {}", engine_state.total_staked_amount);
        Ok(())
    }

    pub fn decrease_total_staked(ctx: Context<UpdateTotalStaked>, amount: u64) -> Result<()> {
        msg!("CPI: decrease_total_staked (amount: {}) called by: {}", amount, ctx.accounts.caller_program.key());
         let engine_state = &mut ctx.accounts.engine_state;
        engine_state.total_staked_amount = engine_state.total_staked_amount
             .checked_sub(amount).ok_or(ErrorCode::CalculationError)?;
         msg!("New total_staked_amount: {}", engine_state.total_staked_amount);
         Ok(())
     }

     pub fn update_ratios(
         ctx: Context<UpdateRatios>,
         new_staking_ratio: u16,
         new_dao_ratio: u16,
         new_dev_ratio: u16
    ) -> Result<()> {
         let engine_state = &mut ctx.accounts.engine_state;
         require_keys_eq!(ctx.accounts.authority.key(), engine_state.authority, ErrorCode::Unauthorized);

         let total_ratio = new_staking_ratio.checked_add(new_dao_ratio)
            .and_then(|sum| sum.checked_add(new_dev_ratio))
            .ok_or(ErrorCode::CalculationError)?;
         require!(total_ratio <= 10000, ErrorCode::InvalidRatioSum);

        engine_state.staking_ratio_bps = new_staking_ratio;
         engine_state.dao_ratio_bps = new_dao_ratio;
         engine_state.developer_ratio_bps = new_dev_ratio;

        msg!("Ratios updated: Staking={}, DAO={}, Dev={}", new_staking_ratio, new_dao_ratio, new_dev_ratio);
        Ok(())
    }
}

// --- Account Contexts ---
#[derive(Accounts)]
pub struct InitializeEngineState<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + EngineState::MAX_SIZE,
        seeds = [b"engine_state_v1"],
        bump
    )]
    pub engine_state: Account<'info, EngineState>,

    /// CHECK: Revenue Safe SPL Account.
    pub revenue_safe: AccountInfo<'info>,
    /// CHECK: Reward Pool PDA Account. Staking Manager Authority.
    pub reward_pool_pda: AccountInfo<'info>,
    /// CHECK: DAO Treasury PDA Account.
    pub dao_treasury_pda: AccountInfo<'info>,
    /// CHECK: Developer Treasury PDA Account.
    pub developer_treasury_pda: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DistributeRevenue<'info> {
    #[account(
        mut,
        seeds = [b"engine_state_v1"],
        bump = engine_state.bump,
        has_one = revenue_safe,
        has_one = reward_pool_pda,
        has_one = dao_treasury_pda,
        has_one = developer_treasury_pda,
    )]
    pub engine_state: Account<'info, EngineState>,

    #[account(
        mut,
        constraint = revenue_safe.owner == engine_state.key() @ ErrorCode::InvalidOwner
    )]
    pub revenue_safe: Account<'info, TokenAccount>,

    #[account(mut)]
    pub reward_pool_pda: Account<'info, TokenAccount>,
    #[account(mut)]
    pub dao_treasury_pda: Account<'info, TokenAccount>,
    #[account(mut)]
    pub developer_treasury_pda: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateTotalStaked<'info> {
    #[account(
        mut,
        seeds = [b"engine_state_v1"],
        bump = engine_state.bump
    )]
    pub engine_state: Account<'info, EngineState>,

    /// CHECK: This ensures only the staking program can call this.
    #[account(
        executable,
        constraint = caller_program.key().to_string() == STAKING_PROGRAM_ID_STR @ ErrorCode::Unauthorized
    )]
    pub caller_program: AccountInfo<'info>,
}

 #[derive(Accounts)]
 pub struct UpdateRatios<'info> {
    #[account(mut, has_one = authority)]
    pub engine_state: Account<'info, EngineState>,
    pub authority: Signer<'info>,
 }


#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Calculation overflow or error")]
    CalculationError,
    #[msg("Invalid sum of ratios, must be <= 10000")]
    InvalidRatioSum,
    #[msg("Account owner is invalid")]
    InvalidOwner,
}