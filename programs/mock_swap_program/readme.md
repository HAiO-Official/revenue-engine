Usage Guide (Test Concept)

Create 2 vault accounts (usdc_vault, haio_vault) directly (ATA or not, but authority must be the same as user):
token create-account --owner <USER_PUBKEY> <USDC_MINT_ADDRESS>
token create-account --owner <USER_PUBKEY> <HAIO_MINT_ADDRESS>

Create using Solana CLI (or Anchor CLI).
On the haio_vault side, pre-mint enough HAiO and deposit it (not given by the program).
The user must have USDC in user_usdc_account.
When calling swap_usdc_for_haio, if you send amount_in,
(a) amount_in USDC moves from user_usdc_account -> usdc_vault
(b) The equivalent amount of HAiO moves from haio_vault -> user_haio_account
In this way, without PDA, the user (including vault) holds the authority of all token accounts,
so in the program logic, token transfers are possible without additional signatures (PDA sign).