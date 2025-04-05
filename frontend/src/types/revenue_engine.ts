/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/revenue_engine.json`.
 */
export type RevenueEngine = {
  "address": "AUdeJW2sdUErNTqyRvSYcYZJE72yURxLxQ9GeEVayLqq",
  "metadata": {
    "name": "revenueEngine",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "HAiO Core Revenue Distribution Engine"
  },
  "instructions": [
    {
      "name": "decreaseTotalStaked",
      "discriminator": [
        147,
        222,
        53,
        101,
        26,
        101,
        230,
        162
      ],
      "accounts": [
        {
          "name": "engineState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  49
                ]
              }
            ]
          }
        },
        {
          "name": "callerProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "distributeRevenue",
      "discriminator": [
        94,
        34,
        239,
        201,
        147,
        227,
        29,
        30
      ],
      "accounts": [
        {
          "name": "engineState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  49
                ]
              }
            ]
          }
        },
        {
          "name": "revenueSafe",
          "writable": true,
          "relations": [
            "engineState"
          ]
        },
        {
          "name": "rewardPoolPda",
          "writable": true,
          "relations": [
            "engineState"
          ]
        },
        {
          "name": "daoTreasuryPda",
          "writable": true,
          "relations": [
            "engineState"
          ]
        },
        {
          "name": "developerTreasuryPda",
          "writable": true,
          "relations": [
            "engineState"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "increaseTotalStaked",
      "discriminator": [
        75,
        119,
        193,
        126,
        212,
        51,
        178,
        226
      ],
      "accounts": [
        {
          "name": "engineState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  49
                ]
              }
            ]
          }
        },
        {
          "name": "callerProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeEngineState",
      "discriminator": [
        115,
        217,
        227,
        200,
        15,
        125,
        39,
        36
      ],
      "accounts": [
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "engineState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  110,
                  103,
                  105,
                  110,
                  101,
                  95,
                  115,
                  116,
                  97,
                  116,
                  101,
                  95,
                  118,
                  49
                ]
              }
            ]
          }
        },
        {
          "name": "revenueSafe"
        },
        {
          "name": "rewardPoolPda"
        },
        {
          "name": "daoTreasuryPda"
        },
        {
          "name": "developerTreasuryPda"
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
      "args": [
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
        }
      ]
    },
    {
      "name": "updateRatios",
      "discriminator": [
        236,
        207,
        202,
        158,
        61,
        250,
        77,
        49
      ],
      "accounts": [
        {
          "name": "engineState",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "engineState"
          ]
        }
      ],
      "args": [
        {
          "name": "newStakingRatio",
          "type": "u16"
        },
        {
          "name": "newDaoRatio",
          "type": "u16"
        },
        {
          "name": "newDevRatio",
          "type": "u16"
        }
      ]
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
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "unauthorized"
    },
    {
      "code": 6001,
      "name": "calculationError",
      "msg": "Calculation overflow or error"
    },
    {
      "code": 6002,
      "name": "invalidRatioSum",
      "msg": "Invalid sum of ratios, must be <= 10000"
    },
    {
      "code": 6003,
      "name": "invalidOwner",
      "msg": "Account owner is invalid"
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
    }
  ]
};
