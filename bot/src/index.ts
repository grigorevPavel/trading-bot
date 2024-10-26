import fs from 'fs'
import dotenv from "dotenv"
import {BytesLike, ethers} from 'ethers'

dotenv.config()

export const CHAIN_ID = 42161
export const MULTICALL_PATH = "config/abis/MulticallABI.json" 
export const MULTICALL_ABI_STR = JSON.parse(
    fs.readFileSync(MULTICALL_PATH, "utf-8")
)?.abi
export const MULTICALL_ADDRESS = process.env.MULTICALL || "no-data"

export const FACTORY_ABI_PATH = "config/abis/FactoryV2ABI.json"
export const PAIR_ABI_PATH = "config/abis/PairV2ABI.json"

export const FACTORY_ABI = JSON.parse(fs.readFileSync(FACTORY_ABI_PATH, "utf-8"))?.abi
export const PAIR_ABI = JSON.parse(fs.readFileSync(PAIR_ABI_PATH, "utf-8"))?.abi

export const MULTICALL_INTERFACE = new ethers.Interface(MULTICALL_ABI_STR)
export const PAIR_INTERFACE = new ethers.Interface(PAIR_ABI)
export const FACTORY_INTERFACE = new ethers.Interface(FACTORY_ABI)

export type FactoryContract = {
    name: string
    address: string
    router: string
    pairs: PairContract[]
}

export type PairContract = {
    token0: string
    token1: string
    address: string
}

export const queryMulticall = async (
    multicallAddress: string,
    multicallInterface: ethers.Interface,
    query: { target: string; allowFailure: boolean; callData: string }[],
    provider: ethers.JsonRpcProvider,
    parseRes: (x: BytesLike) => any
) => {
    try {
        const callData = multicallInterface.encodeFunctionData("aggregate3", [
            query,
        ])
        const response = await provider.call({
            to: multicallAddress,
            data: callData,
        })
        const [callResults] = multicallInterface.decodeFunctionResult(
            "aggregate3",
            response
        )
        return callResults.map(
            (result: { success: boolean; returnData: string }) =>
                result.success ? parseRes(result.returnData) : null
        )
    } catch (error) {
        // Return an array of nulls equivalent to the group size to maintain result structure
        return query.map(() => null)
    }
}

export const toAddressFromBytes = (val: BytesLike) => {
    const coder = new ethers.AbiCoder()

    return coder.decode(["address"], val)[0]
}


export const toReservesFromBytes = (val: BytesLike) => {
    const coder = new ethers.AbiCoder()

    // expect that the 2 first return values are the reserves
    return coder.decode(["uint112", "uint112"], val)
}