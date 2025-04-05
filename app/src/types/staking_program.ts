/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/staking_program.json`.
 */
export type StakingProgram = {
  "address": "DNEYpF5jMNjpxAPNYQhPkpuaxWGudBTvyrmKDkNQdZMP",
  "metadata": {
    "name": "stakingProgram",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Handles NFT Staking and Reward Claims"
  },
  "instructions": [
    {
      "name": "claimRewards",
      "discriminator": [
        4,
        144,
        132,
        71,
        116,
        23,
        151,
        80
      ],
      "accounts": [
        {
          "name": "userWallet",
          "writable": true,
          "signer": true,
          "relations": [
            "nftStakeState"
          ]
        },
        {
          "name": "userHaioAccount",
          "writable": true
        },
        {
          "name": "engineState"
        },
        {
          "name": "nftStakeState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "userWallet"
              },
              {
                "kind": "account",
                "path": "nft_stake_state.nft_mint",
                "account": "nftStakeState"
              }
            ]
          }
        },
        {
          "name": "engineStateLoader"
        },
        {
          "name": "rewardPoolPda",
          "writable": true
        },
        {
          "name": "rewardPoolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  95,
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                  95,
                  115,
                  101,
                  101,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "stake",
      "discriminator": [
        206,
        176,
        202,
        18,
        200,
        209,
        179,
        108
      ],
      "accounts": [
        {
          "name": "userWallet",
          "writable": true,
          "signer": true
        },
        {
          "name": "nftMint"
        },
        {
          "name": "engineState",
          "writable": true
        },
        {
          "name": "revenueEngineProgram",
          "address": "AUdeJW2sdUErNTqyRvSYcYZJE72yURxLxQ9GeEVayLqq"
        },
        {
          "name": "nftStakeState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "userWallet"
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ]
          }
        },
        {
          "name": "stakingProgramExecutable",
          "address": "DNEYpF5jMNjpxAPNYQhPkpuaxWGudBTvyrmKDkNQdZMP"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "unstake",
      "discriminator": [
        90,
        95,
        107,
        42,
        205,
        124,
        50,
        225
      ],
      "accounts": [
        {
          "name": "userWallet",
          "writable": true,
          "signer": true,
          "relations": [
            "nftStakeState"
          ]
        },
        {
          "name": "nftMint",
          "relations": [
            "nftStakeState"
          ]
        },
        {
          "name": "userHaioAccount",
          "writable": true
        },
        {
          "name": "engineState",
          "writable": true
        },
        {
          "name": "revenueEngineProgram",
          "address": "AUdeJW2sdUErNTqyRvSYcYZJE72yURxLxQ9GeEVayLqq"
        },
        {
          "name": "nftStakeState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  102,
                  116,
                  95,
                  115,
                  116,
                  97,
                  107,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "userWallet"
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ]
          }
        },
        {
          "name": "engineStateLoader"
        },
        {
          "name": "rewardPoolPda",
          "writable": true
        },
        {
          "name": "rewardPoolAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  119,
                  97,
                  114,
                  100,
                  95,
                  112,
                  111,
                  111,
                  108,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121,
                  95,
                  115,
                  101,
                  101,
                  100
                ]
              }
            ]
          }
        },
        {
          "name": "stakingProgramExecutable",
          "address": "DNEYpF5jMNjpxAPNYQhPkpuaxWGudBTvyrmKDkNQdZMP"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "engineState",
      "discriminator": [
        26,
        2,
        24,
        225,
        247,
        210,
        96,
        161
      ]
    },
    {
      "name": "nftStakeState",
      "discriminator": [
        39,
        158,
        75,
        12,
        85,
        110,
        107,
        48
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "nftNotStaked",
      "msg": "NFT is not staked or does not belong to the user."
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Caller is not authorized to perform this action."
    },
    {
      "code": 6002,
      "name": "noRewardsToClaim",
      "msg": "No rewards available to claim."
    },
    {
      "code": 6003,
      "name": "calculationError",
      "msg": "Calculation overflow error."
    }
  ],
  "types": [
    {
      "name": "engineState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "revenueSafe",
            "type": "pubkey"
          },
          {
            "name": "rewardPoolPda",
            "type": "pubkey"
          },
          {
            "name": "daoTreasuryPda",
            "type": "pubkey"
          },
          {
            "name": "developerTreasuryPda",
            "type": "pubkey"
          },
          {
            "name": "stakingRatioBps",
            "type": "u16"
          },
          {
            "name": "daoRatioBps",
            "type": "u16"
          },
          {
            "name": "developerRatioBps",
            "type": "u16"
          },
          {
            "name": "totalStakedAmount",
            "type": "u64"
          },
          {
            "name": "rewardPerTokenCumulative",
            "type": "u128"
          },
          {
            "name": "lastDistributionTimestamp",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "nftStakeState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "userWallet",
            "type": "pubkey"
          },
          {
            "name": "nftMint",
            "type": "pubkey"
          },
          {
            "name": "stakedAmount",
            "type": "u64"
          },
          {
            "name": "rewardDebt",
            "type": "u128"
          },
          {
            "name": "lastStakedTimestamp",
            "type": "i64"
          },
          {
            "name": "isStaked",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "engineStateRef",
            "type": "pubkey"
          }
        ]
      }
    }
  ]
};
