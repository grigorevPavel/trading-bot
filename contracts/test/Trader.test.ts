import { expect } from "chai";
import hre, { ethers } from "hardhat";

import { deployTestFixture, deployTraderFixture } from "@/test";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, BytesLike, Contract, ContractTransaction } from "ethers/lib/ethers";

// ESSENTIAL TO IMPORT THIS
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { encodeRoute, epsEqual, randomAddress, SinglePath } from "./helper";
import { Reentrancy__factory, Token, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02, UniswapV2Trader, UniswapV2Trader__factory } from "@/typechain";
import { ERRORS } from "./Errors";

describe('Trader', () => {
    let deployer: SignerWithAddress
    let user0: SignerWithAddress
    let user1: SignerWithAddress
    let owner: SignerWithAddress
    let tokenA: Token
    let tokenB: Token
    let tokenC: Token
    let tokenD: Token
    let factory0: UniswapV2Factory
    let factory1: UniswapV2Factory
    let router0: UniswapV2Router02
    let router1: UniswapV2Router02
    let trader: UniswapV2Trader
    let traderFactory: UniswapV2Trader__factory

    const ONE = ethers.constants.WeiPerEther
    const ADDRESS_ZERO = ethers.constants.AddressZero
    const deadline = BigNumber.from(10).pow(10)
    const wallet = randomAddress()

    beforeEach(async function () {
        const state = await loadFixture(deployTraderFixture)

        deployer = state.signers.deployer
        user0 = state.signers.user0
        user1 = state.signers.user1
        owner = state.signers.owner

        ;[tokenA, tokenB, tokenC, tokenD] = state.tokens

        factory0 = state.factory0
        factory1 = state.factory1
        router0 = state.router0
        router1 = state.router1

        trader = state.trader
        traderFactory = state.traderFactory
    });

    const getPair = async (token0: Contract, token1: Contract, swapFactory: UniswapV2Factory) => {
        const address = await swapFactory.getPair(token0.address, token1.address)
        return await ethers.getContractAt<UniswapV2Pair>('UniswapV2Pair', address)
    }

    const getTargetAmount = async (amountOut: BigNumber, path: string[], router: UniswapV2Router02) => {
        // target amount => amountsIn[0]
        // amountOut => amountsIn.last

        const amountsIn = await router.getAmountsIn(amountOut, path)
        return amountsIn[0]
    }

    describe('constructor', () => {
        it('creates new contract', async () => {
            const newTrader = await traderFactory.deploy()
            expect(newTrader.address).not.eq(ADDRESS_ZERO)
        })
    })

    const getRouteAmountOut = async (amountIn: BigNumber, route: SinglePath[]) => {
        let curAmountIn = amountIn
        for (let path of route) {
            const router = await ethers.getContractAt<UniswapV2Router02>('UniswapV2Router02', path.router)
            const amountsOut = await router.getAmountsOut(curAmountIn, path.tokens)
            curAmountIn = amountsOut[amountsOut.length - 1]
        }
        // last amount out is stored here
        return curAmountIn
    }

    describe('execute', () => {
        it('executes trade according to the given path (start token amount must be transferred to trader before the swap)', async () => {
            // swap through all tokens
            const route: SinglePath[] = [
                {
                    router: router0.address,
                    tokens: [
                        tokenA.address,
                        tokenB.address,
                        tokenC.address
                    ]
                },
                {
                    router: router1.address,
                    tokens: [
                        tokenC.address,
                        tokenD.address,
                        tokenA.address
                    ]
                }
            ]

            // start supply in tokenA
            await tokenA.connect(deployer).mint(trader.address, ONE)

            const amountOut = await trader.callStatic.execute(encodeRoute(ONE, route))

            // check amountOut
            const expectedAmountOut = await getRouteAmountOut(ONE, route)

            // no slippage
            expect(amountOut).eq(expectedAmountOut)

            // execute trade
            const before = await tokenA.balanceOf(deployer.address)
            await trader.execute(encodeRoute(ONE, route))
            const after = await tokenA.balanceOf(deployer.address) 

            expect(after.sub(before)).eq(amountOut)
        })
    })
})