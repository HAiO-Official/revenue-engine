/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/mock_swap_program.json`.
 */
export type MockSwapProgram = {
  "address": "G9gP6qjaZcAyKaCzszcvABkd5UUorfnFe9PjnRkm7qKS",
  "metadata": {
    "name": "mockSwapProgram",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "A simple Mock Swap program for USDC/HAiO"
  },
  "instructions": [
    {
      "name": "initializeMockSwap",
      "discriminator": [
        231,
        129,
        169,
        130,
        203,
        203,
        178,
        141
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "haioMint"
        },
        {
          "name": "athMint"
        },
        {
          "name": "usdcVault",
          "writable": true
        },
        {
          "name": "haioVault",
          "writable": true
        },
        {
          "name": "athVault",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "swapUsdcForAth",
      "discriminator": [
        1,
        251,
        79,
        212,
        10,
        64,
        146,
        170
      ],
      "accounts": [
        {
          "name": "userOrOpWallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "userUsdcAccount",
          "writable": true
        },
        {
          "name": "userAthAccount",
          "writable": true
        },
        {
          "name": "adminUsdcVault",
          "writable": true
        },
        {
          "name": "adminAthVault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "athMint"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        }
      ]
    },
    {
      "name": "swapUsdcForHaio",
      "discriminator": [
        96,
        8,
        139,
        64,
        11,
        204,
        54,
        170
      ],
      "accounts": [
        {
          "name": "userOrOpWallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "userUsdcAccount",
          "writable": true
        },
        {
          "name": "userHaioAccount",
          "writable": true
        },
        {
          "name": "adminUsdcVault",
          "writable": true
        },
        {
          "name": "adminHaioVault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "haioMint"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": "u64"
        }
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "zeroAmount",
      "msg": "Input amount cannot be zero"
    },
    {
      "code": 6001,
      "name": "calculationError",
      "msg": "Calculation overflow"
    },
    {
      "code": 6002,
      "name": "insufficientLiquidity",
      "msg": "Vault has insufficient liquidity for this swap"
    },
    {
      "code": 6003,
      "name": "outputAmountTooLarge",
      "msg": "Calculated output amount exceeds maximum u64 value"
    }
  ]
};
