import { Contract, ethers } from 'ethers'

import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { FactoryContract, PairContract } from './getPairs'

dotenv.config()

const DATA_PATH = 'src/factory/parsedFactories.json'
const WRITE_PATH = 'src/factory/pathsSimple.json'

export type PathsSimple = {
    pair0: {
        factory: {
            address: string,
            name: string
        },
        address: string,
        token0: string,
        token1: string
    },
    pair1: {
        factory: {
            address: string,
            name: string
        },
        address: string,
        token0: string,
        token1: string
    }
}

const main = async () => {
    const dataRaw = fs.readFileSync(DATA_PATH, 'utf-8')
    const factoriesData = JSON.parse(dataRaw) as FactoryContract[]

    console.log(`Searching for pairs with similar tokens...`)

    if (factoriesData.length == 0) throw Error('no factories data')

    let minFactoryIndex = 0

    for (let i = 0; i < factoriesData.length; ++i) {
        if (factoriesData[minFactoryIndex].pairs.length > factoriesData[i].pairs.length)
            minFactoryIndex = i
    }

    let tradablePaths: PathsSimple[] = []

    for (let pairRequired of factoriesData[minFactoryIndex].pairs) {
        for (let i = 0; i < factoriesData.length; ++i) {
            if (i == minFactoryIndex) continue

            for (let pair of factoriesData[i].pairs) {
                if (pairsEq(pairRequired, pair)) {
                    console.log(`Found match for ${factoriesData[minFactoryIndex].name} | ${factoriesData[i].name}`)
                    console.log(`Pair Tokens : ${pairRequired.token0}, ${pairRequired.token1} | ${pair.token0}, ${pair.token1}`)

                    tradablePaths.push({
                        pair0: {
                            factory: {
                                name: factoriesData[minFactoryIndex].name,
                                address: factoriesData[minFactoryIndex].address
                            },
                            token0: pairRequired.token0,
                            token1: pairRequired.token1,
                            address: pairRequired.address
                        },
                        pair1: {
                            factory: {
                                name: factoriesData[i].name,
                                address: factoriesData[i].address
                            },
                            token0: pair.token0,
                            token1: pair.token1,
                            address: pair.address
                        }
                    })
                }
            }
        }
    }

    fs.writeFileSync(WRITE_PATH, JSON.stringify(tradablePaths))
}

const pairsEq = (pair0: PairContract, pair1: PairContract) => {
    return ((pair0.token0.toLowerCase() === pair1.token0.toLowerCase()) && (pair0.token1.toLowerCase() === pair1.token1.toLowerCase())) ||
    ((pair0.token1.toLowerCase() === pair1.token0.toLowerCase()) && (pair0.token0.toLowerCase() === pair1.token1.toLowerCase()))
}

main()