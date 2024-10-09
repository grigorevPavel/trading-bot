import { ethers } from 'ethers'
import { PairContract } from '../factory/getPairs'
import { abi as RESERVES_ABI } from './reservesABI.json'

import dotenv from 'dotenv'
dotenv.config()

export const queryPriceUniV2 = async (pairData: PairContract, provider: ethers.JsonRpcProvider = new ethers.JsonRpcProvider(process.env.RPC), pairAbi: any[] = RESERVES_ABI) => {
    const pair = new ethers.Contract(pairData.address, pairAbi, provider)

    const reserves = await pair.getReserves()
    // price = amount0 / amount1

    const DENOMINATOR = 10n ** 9n

    return {
        priceD: reserves[0] * DENOMINATOR / reserves[1],
        DENOMINATOR,
        reserve0: reserves[0],
        reserve1: reserves[1]
    }
}