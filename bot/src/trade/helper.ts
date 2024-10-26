import { Contract, ethers } from "ethers"
import { ZeroAddress } from "ethers"
import fs from "fs"
import * as tokensConfig from "../factory/tokens.json"

export const CHAIN_ID: Number = 42161

export type Reserves = {
    reserveProfit0: bigint
    reserveTrade0: bigint
    reserveProfit1: bigint
    reserveTrade1: bigint
}

export const calculateArbitrageAmountSimple = (
    reserves: Reserves,
    fee: number = 0,
    slippage: number = 0
) => {
    // tokenProfit => tokenTrade | router0
    // tokenTrade => tokenProfit | router1

    const A = reserves.reserveProfit0
    const B = reserves.reserveTrade0
    const C = reserves.reserveTrade1
    const D = reserves.reserveProfit1

    const minAB = A < B ? A : B
    const minCD = C < D ? C : D
    const minReserve = minAB < minCD ? minAB : minCD

    const DENOMINATOR = getDENOMINATOR(minReserve)

    // fee = uniswap v2 fee (0.3% = 0.003)
    // slippage = 1% (0.01)
    const amount = getOptimalAmountInSimple(
        Number(A / DENOMINATOR),
        Number(B / DENOMINATOR),
        Number(C / DENOMINATOR),
        Number(D / DENOMINATOR),
        fee,
        slippage
    )
    return toBigInt(amount, DENOMINATOR)
}

export const calculateMaxPossibleProfitSimple = (
    amountIn: bigint,
    reserves: Reserves,
    fee: number = 0
) => {
    const A = reserves.reserveProfit0
    const B = reserves.reserveTrade0
    const C = reserves.reserveTrade1
    const D = reserves.reserveProfit1

    const minAB = A < B ? A : B
    const minCD = C < D ? C : D
    const minReserve = minAB < minCD ? minAB : minCD
    const minValue = minReserve < amountIn ? minReserve : amountIn

    const DENOMINATOR = getDENOMINATOR(minValue)

    // fee = uniswap v2 fee (0.3% = 0.003)
    const profit = getMaxPossibleProfitSimple(
        Number(amountIn / DENOMINATOR),
        Number(A / DENOMINATOR),
        Number(B / DENOMINATOR),
        Number(C / DENOMINATOR),
        Number(D / DENOMINATOR),
        fee
    )
    return toBigInt(profit, DENOMINATOR)
}

const getMaxPossibleProfitSimple = (
    x: number,
    A: number,
    B: number,
    C: number,
    D: number,
    fee: number
) => {
    /*
        P(x) = x * B * D * (1 - f)^2 / (A * C + x * C * (1 - f) + x * B * (1 - f)^2) - x
    */

    return (
        (x * B * D * (1 - fee) ** 2) /
            (A * C + x * C * (1 - fee) + x * B * (1 - fee) ** 2) -
        x
    )
}

const getOptimalAmountInSimple = (
    A: number,
    B: number,
    C: number,
    D: number,
    fee: number,
    slippage: number
) => {
    /*
        amountIn = (-AC + (1 - f) * sqrt(ABCD)) / ((1 - f) * C + (1 - f)^2 * B)
    */
    return (
        (Math.sqrt(A * B * C * D * (1 - slippage)) * (1 - fee) - A * C) /
        ((1 - fee) * C + B * (1 - fee) ** 2)
    )
}

function toBigInt(value: number, DENOMINATOR: bigint) {
    return BigInt(Math.floor(value)) * DENOMINATOR
}

function getDENOMINATOR(value: bigint) {
    const delta = 9n
    let DENOMINATOR: bigint
    if (value > 10n ** 24n) {
        DENOMINATOR = 10n ** (24n - delta)
    } else if (value > 10n ** 20n) {
        DENOMINATOR = 10n ** (20n - delta)
    } else if (value > 10n ** 16n) {
        DENOMINATOR = 10n ** (16n - delta)
    } else if (value > 10n ** 12n) {
        DENOMINATOR = 10n ** (12n - delta)
    } else if (value > 10n ** 9n) {
        DENOMINATOR = 10n ** (9n - delta)
    } else {
        DENOMINATOR = 1n
    }

    return DENOMINATOR
}

export const getReservesForTokens = async (pair: Contract, tokenA: string) => {
    const token0 = await pair.token0()
    const reserves = await pair.getReserves()

    if (token0.toLowerCase() === tokenA.toLowerCase())
        return {
            reserveA: reserves[0],
            reserveB: reserves[1],
        }
    else
        return {
            reserveA: reserves[1],
            reserveB: reserves[0],
        }
}

export const detectBaseToken = (token0: string, token1: string) => {
    const baseTokens = tokensConfig.baseTokens

    let token0Profit = false
    let token1Profit = false
    for (let { name, symbol, address } of baseTokens) {
        if (address.toLowerCase() === token0.toLowerCase()) {
            token0Profit = true
        }
        if (address.toLowerCase() === token1.toLowerCase()) {
            token1Profit = true
        }
    }

    if (token0Profit) return token0
    if (token1Profit) return token1
    return ZeroAddress
}

export const eqAddresses = (a: string, b: string) => {
    return a.toLowerCase() === b.toLowerCase()
}

export const LOG_PATH = "src/trade/logs.txt"

export const log = (
    logMessage: string,
    useConsole = true,
    useFile = true,
    logPath = LOG_PATH
) => {
    if (useConsole) console.log(logMessage)
    if (useFile) fs.appendFileSync(logPath, logMessage + "\n")
}

export const getNow = () => {
    let date = new Date()

    return date.toTimeString()
}

export const getBaseTokenInfo = (
    token: string
): {
    name: string
    symbol: string
    decimals: number
    address: string
} => {
    const baseTokens = tokensConfig.baseTokens

    for (let baseToken of baseTokens) {
        if (eqAddresses(token, baseToken.address)) {
            return baseToken
        }
    }

    return {
        name: "",
        symbol: "",
        decimals: 0,
        address: "",
    }
}

export const formatAmount = (amount: bigint, decimals: bigint = 18n, precision: bigint = 3n) => {
    const unit = 10n ** decimals
    const fixedPart = amount / unit
    const floatPart = amount * (10n**precision) / unit

    let strFloatPart = ''
    if (floatPart === 0n) strFloatPart = '0'
    else if (floatPart < 10n) strFloatPart = `00${floatPart}`
    else if (floatPart < 100n) strFloatPart = `0${floatPart}`
    else strFloatPart = `${floatPart}`

    return `${fixedPart}.${strFloatPart}`
}

export const checkAmount = (amount: bigint, decimals: bigint = 18n, precision: bigint = 3n) => {
    return amount * (10n**precision) / (10n**decimals) !== 0n
}