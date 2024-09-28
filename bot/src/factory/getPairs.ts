import { Contract, ethers } from 'ethers'

import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const FACTORIES_DIR = 'config/abis/factories'
const TOKEN_ABI_PATH = 'config/abis/Token.json'

export type FactoryContract = {
    name: string,
    address: string,
    pairs: PairContract[]
}

export type PairContract = {
    token0: string,
    token1: string,
    address: string
}

const tokenABI = (JSON.parse(fs.readFileSync(TOKEN_ABI_PATH, 'utf-8')))?.abi

const RES_DIR = 'src/factory/parsedFactories.json'

const main = async () => {
    const factoriesData = readFactories(FACTORIES_DIR)

    const provider = new ethers.JsonRpcProvider(process.env.RPC_BAHAMUT)
    const network = await provider.getNetwork()
    console.log(`Connected to chain ${network.chainId}...`)

    let factories: FactoryContract[] = []

    for (let { name, address, abi, pairAbi } of factoriesData) {
        console.log(`Parsing factory ${name}...`)

        const factory: FactoryContract = { name, address: address, pairs: [] }
        factories.push(factory)

        console.log(`Querying data for factory ${factory.name}...`)

        const factoryContract = new ethers.Contract(address, abi, provider)

        const pairCount = await factoryContract.allPairsLength()
        console.log('Found ', pairCount, ' pairs')

        for (let i = 0; i < pairCount; ++i) {
            console.log('query pair ', i + 1)

            const pairContract = await queryPair(factoryContract, pairAbi, BigInt(i), provider)
            factory.pairs.push(pairContract)
        }
    }

    console.log(`Writing pairs data to ${RES_DIR}...`)
    
    fs.writeFileSync(RES_DIR, JSON.stringify(factories))
}

const queryPair = async (factory: Contract, pairAbi: any[], pairIndex: bigint, provider: ethers.JsonRpcProvider): Promise<PairContract> => {
    const pairAddress = await factory.allPairs(pairIndex)
    const pair = new ethers.Contract(pairAddress, pairAbi, provider)

    const token0Address = await pair.token0()
    const token1Address = await pair.token1()

    const res: PairContract = {
        address: pairAddress,
        token0: token0Address,
        token1: token1Address
    }

    return res
}

const readFactories = (dirPath: string) => {
    const jsonsInDir = fs.readdirSync(dirPath).filter(file => path.extname(file) === '.json')

    let factories: {name: string, address: string, abi: any[], pairAbi: any[]}[] = []
    jsonsInDir.forEach(file => {
        const fileData = fs.readFileSync(path.join(dirPath, file))
        factories.push(JSON.parse(fileData.toString()))
    });

    return factories
}

main()