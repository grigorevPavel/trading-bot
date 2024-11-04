import 'module-alias/register'

import { HardhatUserConfig, task } from 'hardhat/config'
import { keccak256, toUtf8Bytes } from 'ethers/lib/utils'

import 'hardhat-deploy'
import '@nomiclabs/hardhat-waffle'
import 'hardhat-gas-reporter'
import 'solidity-coverage'
import 'hardhat-contract-sizer'
import '@nomiclabs/hardhat-etherscan'
import '@typechain/hardhat'
import "@nomicfoundation/hardhat-network-helpers";

import { ethers } from 'hardhat'
import { version } from 'process'
import { SolcUserConfig } from 'hardhat/types'

import * as dotenv from "dotenv";

dotenv.config();

task('accounts', 'Prints the list of accounts', async (_, hre) => {
  const accounts = await hre.ethers.getSigners()
  for (const account of accounts) console.log(account.address)
})

task('wallets', 'Create new wallet', async (_, hre) => {
  for (let i = 0; i < 5; i++) {
    const wallet = hre.ethers.Wallet.createRandom()
    console.log({
      address: wallet.address,
      privateKey: wallet.privateKey,
    })
  }
})

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.4.18",
        settings: {
          optimizer: {
            runs: 200,
            enabled: true
          }
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            runs: 200,
            enabled: true
          }
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            runs: 200,
            enabled: true
          }
        },
      },
      {
        version: "0.8.18",
        settings: {
          optimizer: {
            runs: 200,
            enabled: true
          }
        },
      },
    ],
  },
  networks: {
    hardhat: {
      deploy: ['deploy/localhost/'],
      tags: ['localhost']
    },
    arbitrum_mainnet: {
      deploy: ['deploy/mainnet/'],
      tags: ['mainnet'],
      url: process.env.ARBITRUM_URL ?? 'undefined',
      accounts: process.env.PRIVATE_MAIN?.split(','),
      verify: {
        etherscan: {
          apiKey: process.env.ARBITRUM_API ?? 'undefined',
          apiUrl: process.env.ARBITRUM_API_URL ?? 'undefined'
        }
      }
    },
    // place networks here
  },
  gasReporter: {
    enabled: true,
    currency: 'USD',
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
  },
}

export default config
