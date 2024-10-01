import { Contract, ethers } from 'ethers'
import { PairContract } from '../factory/getPairs'
import { abi as PAIR_ABI } from './reservesABI.json'
import fs from 'fs'

import dotenv from 'dotenv'
import { queryPriceUniV2 } from './queryPrice'
import { calculateArbitrageAmountSimple, getReservesForTokens, Reserves, getTokenInfo, detectBaseToken, calculateMaxPossibleProfitSimple } from './helper'
dotenv.config()

import { CronJob } from 'cron'

const PAIRS_PATH = 'src/factory/pathsSimple.json'

const main = async () => {
    const swapFee = 0.003
    const provider = new ethers.JsonRpcProvider(process.env.RPC_BAHAMUT)
    const network = await provider.getNetwork()
    console.log(`Connected to chain ${network.chainId}...`)

    const paths = JSON.parse(fs.readFileSync(PAIRS_PATH, 'utf-8'))

    // collect prices for all paths

    for (let i = 0; i < paths.length; ++i) {
        const path = paths[i]

        console.log(`\n > Querying prices for path: ${path.pair0.token0} | ${path.pair0.token1}`)

        const res0 = await queryPriceUniV2(path.pair0, provider)
        const res1 = await queryPriceUniV2(path.pair1, provider)

        console.log(`  PriceD for pair0: ${res0.priceD}`)
        console.log(`  PriceD for pair1: ${res1.priceD}`)

        const tokenBase = detectBaseToken(path.pair0.token0, path.pair0.token1)
        if (tokenBase !== ethers.ZeroAddress) {
            // using at least 1 base token

            let arbitrageAmount: bigint
            let maxProfit: bigint
            let reservesOptimal: Reserves

            if (tokenBase.toLowerCase() === path.pair0.token0.toLowerCase()) {
                // token0 is base
                const reservesArbitrage1: Reserves = {
                    reserveProfit0: res0.reserve0,
                    reserveTrade0: res0.reserve1,
                    reserveTrade1: res1.reserve1,
                    reserveProfit1: res1.reserve0,
                }
                const reservesArbitrage3: Reserves = {
                    reserveProfit0: res1.reserve0,
                    reserveTrade0: res1.reserve1,
                    reserveTrade1: res0.reserve1,
                    reserveProfit1: res0.reserve0,
                }

                // one amount must be positive. second amount must be negative
                const arbitrageAmount1 = arbitrage(reservesArbitrage1, swapFee)
                const arbitrageAmount3 = arbitrage(reservesArbitrage3, swapFee)

                    ;[arbitrageAmount, reservesOptimal] = arbitrageAmount1 > arbitrageAmount3 ? [arbitrageAmount1, reservesArbitrage1] : [arbitrageAmount3, reservesArbitrage3]
            } else {
                // token 1 is base
                const reservesArbitrage2: Reserves = {
                    reserveProfit0: res0.reserve1,
                    reserveTrade0: res0.reserve0,
                    reserveTrade1: res1.reserve0,
                    reserveProfit1: res1.reserve1,
                }

                const reservesArbitrage4: Reserves = {
                    reserveProfit0: res1.reserve1,
                    reserveTrade0: res1.reserve0,
                    reserveTrade1: res0.reserve0,
                    reserveProfit1: res0.reserve1,
                }

                // one amount must be positive. second amount must be negative
                const arbitrageAmount2 = arbitrage(reservesArbitrage2, swapFee)
                const arbitrageAmount4 = arbitrage(reservesArbitrage4, swapFee)

                    ;[arbitrageAmount, reservesOptimal] = arbitrageAmount2 > arbitrageAmount4 ? [arbitrageAmount2, reservesArbitrage2] : [arbitrageAmount4, reservesArbitrage4]
            }

            if (arbitrageAmount > 0) {
                console.log('  !!! FOUND AN ARBITRAGE OPPRTUNITY ...')
                console.log(`  Optimal Arbitrage amount = ${arbitrageAmount}`)

                maxProfit = calculateMaxPossibleProfitSimple(arbitrageAmount, reservesOptimal, swapFee)
                console.log(`  Max Arbitrage profit = ${maxProfit}`)
            } else {
                console.log('  Fees are too high for making arbitrage ...')
            }
        } else {
            console.log(` Pair does not have Base Tokens, skipping...`)
        }
    }

    console.log('\n--------------------------------------\n\n')

}

const arbitrage = (reserves: Reserves, fee: number) => {
    return (calculateArbitrageAmountSimple(reserves, fee, 0))
}

const pricesEqual = (price0: bigint, price1: bigint, fee = 3n, feeDenominator = 1000n) => {
    return abs(price0 - price1) * feeDenominator / price0 < fee
}

const abs = (x: bigint): bigint => {
    if (x < 0n) return -x
    else return x
}

const max = (a: bigint, b: bigint, c: bigint, d: bigint) => {
    const maxAB = a > b ? a : b
    const maxCD = c > d ? c : d

    return maxAB > maxCD ? maxAB : maxCD
}

const job = new CronJob(
    '*/10 * * * * *', // cronTime
    main, // onTick
    null, // onComplete
    true, // start
);