use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("G9gP6qjaZcAyKaCzszcvABkd5UUorfnFe9PjnRkm7qKS");

const HAIO_PER_USDC: u64 = 50;
const ATH_PER_USDC: u64 = 1;
const USDC_DECIMALS: u8 = 6;
const HAIO_DECIMALS: u8 = 9;
const ATH_DECIMALS: u8 = 9;

#[program]
pub mod mock_swap_program {
    use super::*;

    pub fn initialize_mock_swap(_ctx: Context<InitializeMockSwap>) -> Result<()> {
        msg!("Mock Swap program space initialized (Vaults are externally managed Admin ATAs).");
        Ok(())
    }

    pub fn swap_usdc_for_haio(ctx: Context<SwapUsdcForHaio>, amount_in: u64) -> Result<()> {
        require!(amount_in > 0, SwapError::ZeroAmount);

        let rate_u128 = HAIO_PER_USDC as u128;
        let haio_factor = 10u128.pow(HAIO_DECIMALS as u32);
        let usdc_factor = 10u128.pow(USDC_DECIMALS as u32);
        let amount_out_u128 = (amount_in as u128)
            .checked_mul(rate_u128)
            .ok_or(SwapError::CalculationError)?
            .checked_mul(haio_factor)
            .ok_or(SwapError::CalculationError)?
            .checked_div(usdc_factor)
            .ok_or(SwapError::CalculationError)?;
        require!(
            amount_out_u128 <= u64::MAX as u128,
            SwapError::CalculationError
        );
        let amount_out = amount_out_u128 as u64;
        require!(amount_out > 0, SwapError::ZeroAmount);

        ctx.accounts.admin_haio_vault.reload()?;
        require!(
            ctx.accounts.admin_haio_vault.amount >= amount_out,
            SwapError::InsufficientLiquidity
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc_account.to_account_info(),
                    to: ctx.accounts.admin_usdc_vault.to_account_info(), // Admin's Vault
                    authority: ctx.accounts.user_or_op_wallet.to_account_info(), // OpW signature
                },
            ),
            amount_in,
        )?;
        msg!(
            "MockSwapSimple: Received {} USDC from {}",
            amount_in,
            ctx.accounts.user_or_op_wallet.key()
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_haio_vault.to_account_info(), // Admin's Vault
                    to: ctx.accounts.user_haio_account.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(), // Admin signature
                },
            ),
            amount_out,
        )?;
        msg!(
            "MockSwapSimple: Sent {} HAiO to {}",
            amount_out,
            ctx.accounts.user_or_op_wallet.key()
        );

        Ok(())
    }

    pub fn swap_usdc_for_ath(ctx: Context<SwapUsdcForAth>, amount_in: u64) -> Result<()> {
        require!(amount_in > 0, SwapError::ZeroAmount);

        let rate_u128 = ATH_PER_USDC as u128;
        let ath_factor = 10u128.pow(ATH_DECIMALS as u32);
        let usdc_factor = 10u128.pow(USDC_DECIMALS as u32);

        let combined_factor = rate_u128
            .checked_mul(ath_factor)
            .ok_or(SwapError::CalculationError)?
            .checked_div(usdc_factor)
            .ok_or(SwapError::CalculationError)?;
        let amount_out_u128 = (amount_in as u128)
            .checked_mul(combined_factor)
            .ok_or(SwapError::CalculationError)?;

        require!(
            amount_out_u128 <= u64::MAX as u128,
            SwapError::OutputAmountTooLarge
        );

        let amount_out = amount_out_u128 as u64;

        ctx.accounts.admin_ath_vault.reload()?;
        require!(
            ctx.accounts.admin_ath_vault.amount >= amount_out,
            SwapError::InsufficientLiquidity
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc_account.to_account_info(),
                    to: ctx.accounts.admin_usdc_vault.to_account_info(),
                    authority: ctx.accounts.user_or_op_wallet.to_account_info(),
                },
            ),
            amount_in,
        )?;
        msg!(
            "MockSwap: Received {} USDC from {}",
            amount_in,
            ctx.accounts.user_or_op_wallet.key()
        );

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.admin_ath_vault.to_account_info(),
                    to: ctx.accounts.user_ath_account.to_account_info(),
                    authority: ctx.accounts.admin.to_account_info(),
                },
            ),
            amount_out,
        )?;
        msg!(
            "MockSwap: Sent {} ATH to {}",
            amount_out,
            ctx.accounts.user_or_op_wallet.key()
        );

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeMockSwap<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    pub haio_mint: Account<'info, Mint>,
    pub ath_mint: Account<'info, Mint>,

    #[account(mut)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub haio_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub ath_vault: Account<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SwapUsdcForHaio<'info> {
    #[account(mut)]
    pub user_or_op_wallet: Signer<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, token::mint = usdc_mint)]
    pub user_usdc_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = haio_mint)]
    pub user_haio_account: Account<'info, TokenAccount>,

    #[account(mut, token::mint = usdc_mint)]
    pub admin_usdc_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = haio_mint)]
    pub admin_haio_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub usdc_mint: Account<'info, Mint>,
    pub haio_mint: Account<'info, Mint>,
}

#[derive(Accounts)]
pub struct SwapUsdcForAth<'info> {
    #[account(mut)]
    pub user_or_op_wallet: Signer<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, token::mint = usdc_mint)]
    pub user_usdc_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = ath_mint)]
    pub user_ath_account: Account<'info, TokenAccount>,

    #[account(mut, token::mint = usdc_mint)]
    pub admin_usdc_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = ath_mint)]
    pub admin_ath_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub usdc_mint: Account<'info, Mint>,
    pub ath_mint: Account<'info, Mint>,
}

#[error_code]
pub enum SwapError {
    #[msg("Input amount cannot be zero")]
    ZeroAmount,
    #[msg("Calculation overflow")]
    CalculationError,
    #[msg("Vault has insufficient liquidity for this swap")]
    InsufficientLiquidity,
    #[msg("Calculated output amount exceeds maximum u64 value")]
    OutputAmountTooLarge,
}
