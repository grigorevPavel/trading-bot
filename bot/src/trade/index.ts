import { Contract, ethers } from "ethers"
import { PairContract } from "../"
import fs from "fs"

import dotenv from "dotenv"
import { getPriceD, queryPriceUniV2Batch } from "./queryPrice"
import {
    calculateArbitrageAmountSimple,
    Reserves,
    detectBaseToken,
    calculateMaxPossibleProfitSimple,
    eqAddresses,
    getNow,
    log,
    getBaseTokenInfo,
    formatAmount,
    checkAmount,
} from "./helper"

dotenv.config()

import { CronJob } from "cron"

const PAIRS_PATH = "src/factory/pathsSimple.json"

import { pairs } from "../factory/pairs.json"

const ARBITRAGE_OPPORTUNITIES_PATH = "src/trade/possibleArbitrage.txt"

const main = async () => {
    const swapFee = 0.003
    const provider = new ethers.JsonRpcProvider(process.env.RPC)
    const network = await provider.getNetwork()

    log(`${getNow()}`)
    log(`Connected to chain ${network.chainId}...`)

    const paths = JSON.parse(fs.readFileSync(PAIRS_PATH, "utf-8"))

    const pairsReserves = await getPairsReserves()

    for (let i = 0; i < paths.length; ++i) {
        const path = paths[i]

        log(
            `\n > Querying prices for path: ${path.pair0.token0} | ${path.pair0.token1}`
        )

        const reserves0 = pairsReserves.get(
            path.pair0.address.toLowerCase()
        ) || [0n, 0n]
        const reserves1 = pairsReserves.get(
            path.pair1.address.toLowerCase()
        ) || [0n, 0n]

        const priceD0 = getPriceD(reserves0)
        const priceD1 = getPriceD(reserves1)

        if (priceD0 === -1n || priceD1 === -1n) {
            log(`Price is invalid in the path => skipping...`)
            continue
        }

        // log(` - PriceD for pair0: ${priceD0}`)
        // log(` - PriceD for pair1: ${priceD1}`)

        const tokenBase = detectBaseToken(path.pair0.token0, path.pair0.token1)
        if (tokenBase !== ethers.ZeroAddress) {
            // using at least 1 base token

            let arbitrageAmount: bigint
            let maxProfit: bigint
            let reservesOptimal: Reserves

            if (eqAddresses(tokenBase, path.pair0.token0)) {
                // token0 is base
                const reservesArbitrage1: Reserves = {
                    reserveProfit0: reserves0[0],
                    reserveTrade0: reserves0[1],
                    reserveTrade1: reserves1[1],
                    reserveProfit1: reserves1[0],
                }
                const reservesArbitrage3: Reserves = {
                    reserveProfit0: reserves1[0],
                    reserveTrade0: reserves1[1],
                    reserveTrade1: reserves0[1],
                    reserveProfit1: reserves0[0],
                }

                // one amount must be positive. second amount must be negative
                const arbitrageAmount1 = arbitrage(reservesArbitrage1, swapFee)
                const arbitrageAmount3 = arbitrage(reservesArbitrage3, swapFee)

                ;[arbitrageAmount, reservesOptimal] =
                    arbitrageAmount1 > arbitrageAmount3
                        ? [arbitrageAmount1, reservesArbitrage1]
                        : [arbitrageAmount3, reservesArbitrage3]
            } else {
                // token 1 is base
                const reservesArbitrage2: Reserves = {
                    reserveProfit0: reserves0[1],
                    reserveTrade0: reserves0[0],
                    reserveTrade1: reserves1[0],
                    reserveProfit1: reserves1[1],
                }

                const reservesArbitrage4: Reserves = {
                    reserveProfit0: reserves1[1],
                    reserveTrade0: reserves1[0],
                    reserveTrade1: reserves0[0],
                    reserveProfit1: reserves0[1],
                }

                // one amount must be positive. second amount must be negative
                const arbitrageAmount2 = arbitrage(reservesArbitrage2, swapFee)
                const arbitrageAmount4 = arbitrage(reservesArbitrage4, swapFee)

                ;[arbitrageAmount, reservesOptimal] =
                    arbitrageAmount2 > arbitrageAmount4
                        ? [arbitrageAmount2, reservesArbitrage2]
                        : [arbitrageAmount4, reservesArbitrage4]
            }

            if (arbitrageAmount > 0) {
                const tokenData = getBaseTokenInfo(tokenBase)

                console.log(tokenData)

                log("!!! FOUND AN ARBITRAGE OPPRTUNITY ...")
                log(
                    `Optimal Arbitrage amount = ${arbitrageAmount} wei, ${formatAmount(
                        arbitrageAmount,
                        BigInt(tokenData.decimals)
                    )} ${tokenData.symbol}`
                )

                maxProfit = calculateMaxPossibleProfitSimple(
                    arbitrageAmount,
                    reservesOptimal,
                    swapFee
                )
                log(
                    `Max Arbitrage profit = ${maxProfit} weis, ${formatAmount(
                        maxProfit,
                        BigInt(tokenData.decimals)
                    )} ${tokenData.symbol}`
                )

                if (checkAmount(maxProfit, BigInt(tokenData.decimals))) {
                    // additional log into another file
                    log(
                        `${getNow()}`,
                        false,
                        true,
                        ARBITRAGE_OPPORTUNITIES_PATH
                    )
                    log(
                        `Tokens ${path.pair0.token0} | ${path.pair0.token1}`,
                        false,
                        true,
                        ARBITRAGE_OPPORTUNITIES_PATH
                    )
                    log(
                        `Pair1 ${path.pair0.address} | ${path.pair1.address}`,
                        false,
                        true,
                        ARBITRAGE_OPPORTUNITIES_PATH
                    )
                    log(
                        `Optimal Arbitrage amount = ${arbitrageAmount} wei, ${formatAmount(
                            arbitrageAmount,
                            BigInt(tokenData.decimals)
                        )} ${tokenData.symbol}`,
                        false,
                        true,
                        ARBITRAGE_OPPORTUNITIES_PATH
                    )
                    log(
                        `Max Arbitrage profit = ${maxProfit} weis, ${formatAmount(
                            maxProfit,
                            BigInt(tokenData.decimals)
                        )} ${tokenData.symbol}\n\n`,
                        false,
                        true,
                        ARBITRAGE_OPPORTUNITIES_PATH
                    )
                }
            } else {
                log("Fees are too high for making arbitrage ...")
            }
        } else {
            log(`Pair does not have Base Tokens, skipping...`)
        }
    }

    log("\n--------------------------------------\n\n")
}

const getPairsReserves = async (): Promise<Map<string, [bigint, bigint]>> => {
    // query all reserves via multicall
    const reserves = await queryPriceUniV2Batch(pairs)
    const reservesMap: Map<string, [bigint, bigint]> = new Map()

    // map reserves to their pairs
    for (let i = 0; i < pairs.length; ++i) {
        reservesMap.set(pairs[i].toLowerCase(), [
            reserves[i][0],
            reserves[i][1],
        ])
    }

    return reservesMap
}

const arbitrage = (reserves: Reserves, fee: number) => {
    return calculateArbitrageAmountSimple(reserves, fee, 0)
}

const pricesEqual = (
    price0: bigint,
    price1: bigint,
    fee = 3n,
    feeDenominator = 1000n
) => {
    return (abs(price0 - price1) * feeDenominator) / price0 < fee
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
    "*/5 * * * * *", // cronTime
    main, // onTick
    null, // onComplete
    true // start
)
