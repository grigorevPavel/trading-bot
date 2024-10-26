import { Contract, ethers } from "ethers"

import fs from "fs"
import path from "path"
import dotenv from "dotenv"
import { FactoryContract, PairContract } from "../"
import * as tokensConfig from "./tokens.json"

dotenv.config()

const DATA_PATH = "src/factory/parsedFactories/"
const WRITE_PATH = "src/factory/pathsSimple.json"
const WRITE_PAIRS_PATH = "src/factory/pairs.json"

export type PathsSimple = {
    pair0: {
        factory: {
            address: string
            name: string
        }
        address: string
        token0: string
        token1: string
    }
    pair1: {
        factory: {
            address: string
            name: string
        }
        address: string
        token0: string
        token1: string
    }
}

const main = async () => {
    const provider = new ethers.JsonRpcProvider(process.env.RPC || 'undefined RPC')
    const factoriesData = readData(DATA_PATH, Number((await provider.getNetwork()).chainId))
    const baseTokensList = tokensConfig.baseTokens
    let baseTokensSet: Set<string> = new Set<string>()
    let pairsSet: Set<string> = new Set<string>()

    for (let token of baseTokensList) {
        baseTokensSet.add(token.address.toLowerCase())
    }

    if (factoriesData.length == 0) throw Error("no factories data")

    let tradablePaths: PathsSimple[] = []

    // match each factory with each other

    let factoriesSet: Set<string> = new Set<string>()

    for (let factory1 of factoriesData) {
        for (let factory2 of factoriesData) {
            // check factories are different
            if (factoriesEq(factory1, factory2)) continue

            // check factories pair has not been checked yet
            const name1 = factory1.name
            const name2 = factory2.name

            // check pairs match
            console.log(
                `Searching for pairs with similar tokens for ${name1}, ${name2}...`
            )

            if (factoriesSet.has(name1.toLowerCase() + name2.toLowerCase())) {
                console.log("skipping...")
                continue
            }

            if (factoriesSet.has(name2.toLowerCase() + name1.toLowerCase())) {
                console.log("skipping")
                continue
            }

            factoriesSet.add(name1.toLowerCase() + name2.toLowerCase())

            for (let pair1 of factory1.pairs) {
                for (let pair2 of factory2.pairs) {
                    if (pairsEq(pair1, pair2)) {
                        // console.log(
                        //     `Pair Tokens : ${pair1.token0}, ${pair1.token1} | ${pair2.token0}, ${pair2.token1}`
                        // )

                        // check that at least one of tokens is a base token
                        if (
                            !baseTokensSet.has(pair1.token0.toLowerCase()) &&
                            !baseTokensSet.has(pair1.token1.toLowerCase())
                        )
                            continue

                        pairsSet.add(pair1.address.toLowerCase())
                        pairsSet.add(pair2.address.toLowerCase())

                        tradablePaths.push({
                            pair0: {
                                factory: {
                                    name: factory1.name,
                                    address: factory1.address,
                                },
                                token0: pair1.token0,
                                token1: pair1.token1,
                                address: pair1.address,
                            },
                            pair1: {
                                factory: {
                                    name: factory2.name,
                                    address: factory2.address,
                                },
                                token0: pair2.token0,
                                token1: pair2.token1,
                                address: pair2.address,
                            },
                        })
                    }
                }
            }
        }
    }

    console.log(`Found ${tradablePaths.length} paths`)
    fs.writeFileSync(WRITE_PATH, JSON.stringify(tradablePaths))

    let pairs: string[] = []
    for (let pair of pairsSet.values()) {
        pairs.push(pair)
    }
    fs.writeFileSync(WRITE_PAIRS_PATH, JSON.stringify({
        pairs: pairs
    }))
}

const factoriesEq = (factory1: FactoryContract, factory2: FactoryContract) => {
    const name1 = factory1.name
    const name2 = factory2.name
    return name1.toLowerCase() === name2.toLocaleLowerCase()
}

const pairsEq = (pair0: PairContract, pair1: PairContract) => {
    return (
        (pair0.token0.toLowerCase() === pair1.token0.toLowerCase() &&
            pair0.token1.toLowerCase() === pair1.token1.toLowerCase()) ||
        (pair0.token1.toLowerCase() === pair1.token0.toLowerCase() &&
            pair0.token0.toLowerCase() === pair1.token1.toLowerCase())
    )
}

const readData = (dirPath: string, chain: Number) => {
    const pathSearch = dirPath + chain.toString() + "/"
    const jsonsInDir = fs
        .readdirSync(pathSearch)
        .filter((file) => path.extname(file) === ".json")

    let factories: FactoryContract[] = []
    jsonsInDir.forEach((file) => {
        const fileData = fs.readFileSync(path.join(pathSearch, file))
        factories = factories.concat(JSON.parse(fileData.toString()))
    })

    return factories
}

main()
