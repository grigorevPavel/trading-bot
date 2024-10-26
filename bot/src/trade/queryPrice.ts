import { ethers } from "ethers"
import {
    MULTICALL_ABI_STR,
    CHAIN_ID,
    MULTICALL_ADDRESS,
    PAIR_ABI,
    PairContract,
    PAIR_INTERFACE,
    MULTICALL_INTERFACE,
    queryMulticall,
    toReservesFromBytes,
} from "../index"

import dotenv from "dotenv"
import { log } from "./helper"
dotenv.config()

export const queryPriceUniV2 = async (
    pairData: PairContract,
    provider: ethers.JsonRpcProvider = new ethers.JsonRpcProvider(
        process.env.RPC
    ),
    pairAbi: any[] = PAIR_ABI
) => {
    const pair = new ethers.Contract(pairData.address, pairAbi, provider)

    const reserves = await pair.getReserves()
    // price = amount0 / amount1

    const DENOMINATOR = 10n ** 9n

    return {
        priceD: (reserves[0] * DENOMINATOR) / reserves[1],
        DENOMINATOR,
        reserve0: reserves[0],
        reserve1: reserves[1],
    }
}

export const queryPriceUniV2Batch = async (
    pairs: string[],
    batchSize = 1000,
    provider: ethers.JsonRpcProvider = new ethers.JsonRpcProvider(
        process.env.RPC
    )
) => {
    const pairCount = pairs.length

    let allReserves: [bigint, bigint, bigint][] = []

    for (let i = 0; i < pairCount; i += batchSize) {
        let query: {
            target: string
            allowFailure: boolean
            callData: string
        }[] = []

        // construct query

        const limit = i + batchSize > pairCount ? pairCount : i + batchSize

        log(`Requesting pairs reserves in range [${i}, ${limit}]`)
        for (let index = i; index < limit; ++index) {
            query.push({
                target: pairs[index],
                allowFailure: false,
                callData: PAIR_INTERFACE.encodeFunctionData("getReserves", []),
            })
        }

        const queryRes = await queryMulticall(
            MULTICALL_ADDRESS,
            MULTICALL_INTERFACE,
            query,
            provider,
            toReservesFromBytes
        )
        allReserves = allReserves.concat(queryRes)
    }

    return allReserves
}

export const getPriceD = (reserves: [bigint, bigint]) => {
    const DENOMINATOR = 10n ** 9n

    if (reserves[1] === 0n) return -1n

    return (reserves[0] * DENOMINATOR) / reserves[1]
}
