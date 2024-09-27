import { ethers, network } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { randomBytes } from 'crypto';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers/lib/ethers';
import { Token, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from '@/typechain';

export const randomAddress = () => {
    const id = randomBytes(32).toString("hex");
    const privateKey = "0x" + id;
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
};

export const addSigner = async (
    address: string
): Promise<SignerWithAddress> => {
    await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [address],
    });
    await network.provider.send("hardhat_setBalance", [
        address,
        "0x1000000000000000000",
    ]);
    return await ethers.getSigner(address);
};

export const removeSigner = async (address: string) => {
    await network.provider.request({
        method: "hardhat_stopImpersonatingAccount",
        params: [address],
    });
};

export const useSigner = async (
    address: string,
    f: (signer: SignerWithAddress) => Promise<void>
) => {
    const signer = await addSigner(address);
    await f(signer);
    await removeSigner(address);
};

export const sleepTo = async (timestamp: BigNumberish) => {
    await network.provider.send("evm_setNextBlockTimestamp", [
        Number(timestamp),
    ]);
    await network.provider.send("evm_mine");
};

export const sleep = async (seconds: BigNumberish) => {
    await network.provider.send("evm_increaseTime", [
        Number(seconds),
    ]);
    await network.provider.send("evm_mine");
};

export const epsEqual = (
    a: BigNumber,
    b: BigNumber,
    eps: BigNumber = BigNumber.from(1),
    decimals: BigNumber = BigNumber.from(10).pow(4),
    zeroThresh = BigNumber.from(10).pow(1)
) => {
    if (a.eq(b)) return true;

    let res: boolean = false
    if (a.eq(0)) res = b.lte(zeroThresh)
    if (b.eq(0)) res = a.lte(zeroThresh)
    // |a - b| / a < eps <==> a ~ b
    if (!(a.mul(b)).eq(0)) res = (((a.sub(b)).abs()).mul(decimals).div(a)).lt(eps)

    if (!res) console.log(`A = ${Number(a)}, B = ${Number(b)}`)
    return res
}

export const epsEqualNumber = (
    a: number,
    b: number,
    eps: number = 1,
    decimals: number = 10 ** 4
) => {
    if (a === b) return true;

    let res: boolean = false
    if (a === 0) res = b < eps
    if (b === 0) res = a < eps
    // |a - b| / a < eps <==> a ~ b
    if (a * b !== 0) res = (Math.abs(a - b) / a) < eps

    if (!res) console.log(`A = ${Number(a)}, B = ${Number(b)}`)
    return res
}

export const ONE = ethers.constants.WeiPerEther

export type SinglePath = {
    router: string,
    tokens: string[],
}

export const encodeRoute = (amountIn: BigNumber, minAmountOut: BigNumber, route: SinglePath[]) => {
    const encoder = new ethers.utils.AbiCoder()
    return encoder.encode(["uint256", "uint256", "tuple(address router, address[] tokens)[]"], [amountIn, minAmountOut, route])
}

export async function enableInitializer(contract: string) {
    const INITIALIZERS_SLOT = 0
    const value = ethers.utils.hexlify(
        ethers.utils.zeroPad(BigNumber.from(0)._hex, 32)
    )
    await ethers.provider.send('hardhat_setStorageAt', [
        contract,
        ethers.utils.hexValue(INITIALIZERS_SLOT),
        value,
    ])
}

export const getReservesForTokens = async (pair: UniswapV2Pair, tokenA: Token, tokenB: Token) => {
    const token0 = await pair.token0()
    const reserves = await pair.getReserves()

    if (token0.toLowerCase() === tokenA.address.toLowerCase())
        return {
            reserveA: reserves[0],
            reserveB: reserves[1]
        }
    else
        return {
            reserveA: reserves[1],
            reserveB: reserves[0]
        }
}

export const calculateArbitrageAmountSimple = async (router0: UniswapV2Router02, router1: UniswapV2Router02, tokenProfit: Token, tokenTrade: Token, fee: number = 0, slippage: number = 0) => {
    // tokenProfit => tokenTrade | router0
    // tokenTrade => tokenProfit | router1

    const factory0 = await ethers.getContractAt<UniswapV2Factory>('UniswapV2Factory', await router0.factory())
    const factory1 = await ethers.getContractAt<UniswapV2Factory>('UniswapV2Factory', await router1.factory())

    const pair0 = await ethers.getContractAt<UniswapV2Pair>('UniswapV2Pair', await factory0.getPair(tokenProfit.address, tokenTrade.address))
    const pair1 = await ethers.getContractAt<UniswapV2Pair>('UniswapV2Pair', await factory1.getPair(tokenProfit.address, tokenTrade.address))

    const { reserveA: A, reserveB: B } = await getReservesForTokens(pair0, tokenProfit, tokenTrade)
    const { reserveA: C, reserveB: D } = await getReservesForTokens(pair1, tokenTrade, tokenProfit)

    const minAB = A.lt(B) ? A : B
    const minCD = C.lt(D) ? C : D
    const minReserve = minAB.lt(minCD) ? minAB : minCD

    const DENOMINATOR = getDENOMINATOR(minReserve)

    // fee = uniswap v2 fee (0.3% = 0.003)
    // slippage = 1% (0.01)
    const amount = (getOptimalAmountInSimple(Number(A.div(DENOMINATOR)), Number(B.div(DENOMINATOR)), Number(C.div(DENOMINATOR)), Number(D.div(DENOMINATOR)), fee, slippage))
    return toBigNumber(amount, DENOMINATOR)
}

export const getOptimalAmountInSimple = (A: number, B: number, C: number, D: number, fee: number, slippage: number) => {
    /*
        amountIn = (-AC + (1 - f) * sqrt(ABCD)) / ((1 - f) * C + (1 - f)^2 * B)
    */
    return (Math.sqrt(A * B * C * D * (1 - slippage)) * (1 - fee) - A * C) / ((1 - fee) * C + B * ((1 - fee) ** 2))
}

function toBigNumber(value: number, DENOMINATOR: BigNumber) {
    return BigNumber.from(Math.floor(value)).mul(DENOMINATOR)
}

function getDENOMINATOR(value: BigNumber) {
    const delta = 9
    let DENOMINATOR: BigNumber
    if (value > BigNumber.from(10).pow(24)){
        DENOMINATOR = BigNumber.from(10).pow(24 - delta)
    } else if (value > BigNumber.from(10).pow(20)) {
        DENOMINATOR = BigNumber.from(10).pow(20 - delta)
    }
    else if (value > BigNumber.from(10).pow(16)) {
        DENOMINATOR = BigNumber.from(10).pow(16 - delta)
    } else if (value > BigNumber.from(10).pow(12)) {
        DENOMINATOR = BigNumber.from(10).pow(12 - delta)
    } else if (value > BigNumber.from(10).pow(9)) {
        DENOMINATOR = BigNumber.from(10).pow(9 - delta)
    } else {
        DENOMINATOR = BigNumber.from(1)
    }

    return DENOMINATOR
}
