/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/raid_escrow.json`.
 */
export type RaidEscrow = {
  "address": "BLQWXoLgNdxEh7nDrUPFqxN3nAFAEho6HiXSdsoJrDRu",
  "metadata": {
    "name": "raidEscrow",
    "version": "1.0.0",
    "spec": "0.1.0",
    "description": "Solana Anchor program for multi-party raid token distribution"
  },
  "instructions": [
    {
      "name": "claimTokens",
      "discriminator": [
        108,
        216,
        210,
        231,
        0,
        212,
        42,
        64
      ],
      "accounts": [
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "participant",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "participantTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "participant"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "raidEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "raidId"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "raidEscrow"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        }
      ],
      "args": [
        {
          "name": "raidId",
          "type": "string"
        }
      ]
    },
    {
      "name": "closeRaid",
      "discriminator": [
        170,
        192,
        172,
        179,
        221,
        43,
        5,
        233
      ],
      "accounts": [
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true,
          "relations": [
            "raidEscrow"
          ]
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "creatorTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "raidEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "raidId"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "raidEscrow"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        }
      ],
      "args": [
        {
          "name": "raidId",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeRaid",
      "discriminator": [
        65,
        9,
        122,
        58,
        90,
        95,
        56,
        90
      ],
      "accounts": [
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenMint"
        },
        {
          "name": "creatorTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "raidEscrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  97,
                  105,
                  100
                ]
              },
              {
                "kind": "arg",
                "path": "raidId"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "raidEscrow"
              },
              {
                "kind": "account",
                "path": "tokenProgram"
              },
              {
                "kind": "account",
                "path": "tokenMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        }
      ],
      "args": [
        {
          "name": "raidId",
          "type": "string"
        },
        {
          "name": "tokensPerParticipant",
          "type": "u64"
        },
        {
          "name": "maxSeats",
          "type": "u8"
        },
        {
          "name": "durationMinutes",
          "type": "u16"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "raidEscrow",
      "discriminator": [
        76,
        249,
        127,
        24,
        249,
        189,
        114,
        198
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "raidIdTooLong",
      "msg": "Raid ID is too long (max 32 characters)"
    },
    {
      "code": 6001,
      "name": "invalidMaxSeats",
      "msg": "Maximum seats must be between 1 and 10"
    },
    {
      "code": 6002,
      "name": "invalidTokenAmount",
      "msg": "Tokens per participant must be greater than zero"
    },
    {
      "code": 6003,
      "name": "invalidDuration",
      "msg": "Duration must be greater than zero"
    },
    {
      "code": 6004,
      "name": "mathOverflow",
      "msg": "Math overflow occurred"
    },
    {
      "code": 6005,
      "name": "raidExpired",
      "msg": "This raid has expired"
    },
    {
      "code": 6006,
      "name": "alreadyClaimed",
      "msg": "You have already claimed tokens from this raid"
    },
    {
      "code": 6007,
      "name": "raidFull",
      "msg": "This raid is full"
    },
    {
      "code": 6008,
      "name": "insufficientEscrowBalance",
      "msg": "Insufficient tokens in escrow"
    },
    {
      "code": 6009,
      "name": "insufficientCreatorBalance",
      "msg": "Insufficient token balance in creator's account"
    },
    {
      "code": 6010,
      "name": "failedTransfer",
      "msg": "Failed to transfer tokens"
    },
    {
      "code": 6011,
      "name": "failedClosure",
      "msg": "Failed to close escrow account"
    }
  ],
  "types": [
    {
      "name": "raidEscrow",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "raidId",
            "type": "string"
          },
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "tokenMint",
            "type": "pubkey"
          },
          {
            "name": "tokensPerParticipant",
            "type": "u64"
          },
          {
            "name": "maxSeats",
            "type": "u8"
          },
          {
            "name": "claimedCount",
            "type": "u8"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "expiresAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "claimedBy",
            "type": {
              "vec": "pubkey"
            }
          }
        ]
      }
    }
  ]
};
