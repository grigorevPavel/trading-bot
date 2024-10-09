import { BytesLike, Contract, ethers } from "ethers"

import fs from "fs"
import path from "path"
import dotenv from "dotenv"

dotenv.config()

const TOKEN_ABI_PATH = "config/abis/TokenABI.json"
const FACTORY_ABI_PATH = "config/abis/FactoryV2ABI.json"
const PAIR_ABI_PATH = "config/abis/PairV2ABI.json"
const MULTICALL_PATH = "config/abis/MulticallABI.json"

const TOKEN_ABI = JSON.parse(fs.readFileSync(TOKEN_ABI_PATH, "utf-8"))?.abi
const FACTORY_ABI = JSON.parse(fs.readFileSync(FACTORY_ABI_PATH, "utf-8"))?.abi
const PAIR_ABI = JSON.parse(fs.readFileSync(PAIR_ABI_PATH, "utf-8"))?.abi
const MULTICALL_ABI_STR = JSON.parse(
    fs.readFileSync(MULTICALL_PATH, "utf-8")
)?.abi

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

const FACTORIES_DIR = "config/abis/factories/"
const OUT_DIR = "src/factory/parsedFactories/"

const MULTICALL_ADDRESS = process.env.MULTICALL || "no-data"

const MULTICALL_INTERFACE = new ethers.Interface(MULTICALL_ABI_STR)
const PAIR_INTERFACE = new ethers.Interface(PAIR_ABI)
const FACTORY_INTERFACE = new ethers.Interface(FACTORY_ABI)


const main = async () => {
    const provider = new ethers.JsonRpcProvider(process.env.RPC)
    const network = await provider.getNetwork()
    console.log(`Connected to chain ${network.chainId}...`)

    const CHAIN_ID = `${network.chainId.toString()}/`

    const factoriesData = readFactories(FACTORIES_DIR + CHAIN_ID)

    let factories: FactoryContract[] = []

    for (let { name, address, router } of factoriesData) {
        if (fs.existsSync(OUT_DIR + CHAIN_ID + name + ".json")) {
            console.log(`Found parsed config for ${name} => skipping...\n`)
            continue
        }

        console.log(`Parsing factory ${name}...`)

        const factory: FactoryContract = { name, address, router, pairs: [] }
        factories.push(factory)

        console.log(`Querying data for factory ${factory.name}...`)

        const factoryContract = new ethers.Contract(
            address,
            FACTORY_ABI,
            provider
        )

        const pairCount = await factoryContract.allPairsLength()
        console.log("Found ", pairCount, " pairs")

        const pairsData = await getAllPairsMulticall(
            factory,
            pairCount,
            provider,
            1_000
        )

        factory.pairs = pairsData || []

        const fileName = OUT_DIR + CHAIN_ID + name + ".json"

        if (!fs.existsSync(OUT_DIR + CHAIN_ID)) {
            fs.mkdirSync(OUT_DIR + CHAIN_ID, { recursive: true })
        }

        fs.writeFileSync(fileName, JSON.stringify(factory))
    }
}

const getAllPairsMulticall = async (
    factory: FactoryContract,
    pairCount: bigint,
    provider: ethers.JsonRpcProvider,
    batchSize = 1000
): Promise<PairContract[] | undefined> => {
    let allPairs: string[] = []
    let allTokens: string[] = []
    let allPairsData: PairContract[] = []

    for (let i = 0; i < pairCount; i += batchSize) {
        let query: {
            target: string
            allowFailure: boolean
            callData: string
        }[] = []

        // construct query

        const limit = i + batchSize > pairCount ? pairCount : i + batchSize

        console.log(`Requesting pairs in range [${i}, ${limit}]`)
        for (let index = i; index < limit; ++index) {
            query.push({
                target: factory.address,
                allowFailure: false,
                callData: FACTORY_INTERFACE.encodeFunctionData(
                    "allPairs",
                    [index]
                ),
            })
        }

        const queryRes = await queryMulticall(
            MULTICALL_ADDRESS,
            MULTICALL_INTERFACE,
            query,
            provider
        )
        allPairs = allPairs.concat(queryRes)
    }

    for (let i = 0; i < allPairs.length; i += batchSize) {
        let query: {
            target: string
            allowFailure: boolean
            callData: string
        }[] = []

        // construct query

        const limit = i + batchSize > allPairs.length ? allPairs.length : i + batchSize

        console.log(`Requesting pair tokens in range [${i}, ${limit}]`)
        for (let index = i; index < limit; ++index) {
            query.push({
                target: allPairs[index], // pair address
                allowFailure: false,
                callData: PAIR_INTERFACE.encodeFunctionData(
                    "token0",
                    []
                ),
            })

            query.push({
                target: allPairs[index], // pair address
                allowFailure: false,
                callData: PAIR_INTERFACE.encodeFunctionData(
                    "token1",
                    []
                ),
            })
        }

        const queryDataRes = await queryMulticall(
            MULTICALL_ADDRESS,
            MULTICALL_INTERFACE,
            query,
            provider
        )
        allTokens = allTokens.concat(queryDataRes)
    }

    // construct pairContract instance
    for (let i = 0; i < allPairs.length; ++i) {
        allPairsData.push({
            address: allPairs[i],
            token0: allTokens[i * 2],
            token1: allTokens[i * 2 + 1]
        })
    }

    return allPairsData
}

const toAddressFromBytes = (val: BytesLike) => {
    const coder = new ethers.AbiCoder()

    return coder.decode(["address"], val)[0]
}

const queryMulticall = async (
    multicallAddress: string,
    multicallInterface: ethers.Interface,
    query: { target: string; allowFailure: boolean; callData: string }[],
    provider: ethers.JsonRpcProvider
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
                result.success ? toAddressFromBytes(result.returnData) : null
        )
    } catch (error) {
        // Return an array of nulls equivalent to the group size to maintain result structure
        return query.map(() => null)
    }
}

const queryPair = async (
    factory: Contract,
    pairAbi: any[],
    pairIndex: bigint,
    provider: ethers.JsonRpcProvider
): Promise<PairContract> => {
    const pairAddress = await factory.allPairs(pairIndex)
    const pair = new ethers.Contract(pairAddress, pairAbi, provider)

    const token0Address = await pair.token0()
    const token1Address = await pair.token1()

    const res: PairContract = {
        address: pairAddress,
        token0: token0Address,
        token1: token1Address,
    }

    return res
}

const readFactories = (dirPath: string) => {
    const jsonsInDir = fs
        .readdirSync(dirPath)
        .filter((file) => path.extname(file) === ".json")

    let factories: { name: string; address: string; router: string }[] = []
    jsonsInDir.forEach((file) => {
        const fileData = fs.readFileSync(path.join(dirPath, file))
        factories.push(JSON.parse(fileData.toString()))
    })

    return factories
}

main()
