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
    const ZERO = BigNumber.from(0)

    const slippage = BigNumber.from(50)

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

            const amountOut = await trader.callStatic.execute(encodeRoute(ONE, ZERO, route))

            // check amountOut
            const expectedAmountOut = await getRouteAmountOut(ONE, route)

            // no slippage
            expect(amountOut).eq(expectedAmountOut)

            // execute trade
            const before = await tokenA.balanceOf(deployer.address)
            await trader.execute(encodeRoute(ONE, ZERO, route))
            const after = await tokenA.balanceOf(deployer.address)

            expect(after.sub(before)).eq(amountOut)
        })

        describe('edge cases', () => {
            describe('when called not from executor', () => {
                it(`reverts with ${ERRORS.NOT_EXECUTOR_ROLE}`, async () => {
                    await expect(trader.connect(user0).execute(encodeRoute(ONE, ZERO, []))).revertedWith(ERRORS.NOT_EXECUTOR_ROLE)
                })
            })

            describe('when not enoung start tokens transferred to trader', () => {
                it(`reverts with ${ERRORS.NOT_ENOUGH_START_COLLATERAL}`, async () => {
                    await tokenA.transfer(trader.address, 999)
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

                    await expect(trader.execute(encodeRoute(ONE, ZERO, route))).revertedWith(ERRORS.NOT_ENOUGH_START_COLLATERAL)
                })
            })

            describe('when slippage set to != 0', () => {
                it(`reverts when amountOut < amountOutMin`, async () => {

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

                    const expectedAmountOut = await getRouteAmountOut(ONE, route)

                    // frontrun causes slippage
                    await tokenA.mint(trader.address, ONE.div(100))
                    await trader.execute(encodeRoute(ONE.div(100), ZERO, route))

                    // expect to swap for the previous price
                    await tokenA.transfer(trader.address, ONE)
                    await expect(trader.execute(encodeRoute(ONE, expectedAmountOut, route))).to.be.revertedWith(ERRORS.AMOUNT_OUT_TOO_LOW)
                })
            })

            describe('when route is invalid', () => {
                describe('when route len == 0', () => {
                    it(`reverts with ${ERRORS.INVALID_LEN}`, async () => {
                        await expect(trader.execute(encodeRoute(ONE, ZERO, []))).to.be.revertedWith(ERRORS.INVALID_LEN)
                    })
                })

                describe('when route[i].len < 2', () => {
                    it(`reverts with ${ERRORS.INVALID_SINGLE_PATH}`, async () => {
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
                                ]
                            }
                        ]

                        await expect(trader.execute(encodeRoute(ONE, ZERO, route))).to.be.revertedWith(ERRORS.INVALID_SINGLE_PATH)
                    })
                })

                describe('when route[i].router == 0x0', () => {
                    it(`reverts with ${ERRORS.ZERO_ADDRESS}`, async () => {
                        const route: SinglePath[] = [
                            {
                                router: ADDRESS_ZERO,
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

                        await expect(trader.execute(encodeRoute(ONE, ZERO, route))).to.be.revertedWith(ERRORS.ZERO_ADDRESS)
                    })
                })

                describe('when route[i].token[j] == 0x0', () => {
                    it(`reverts with ${ERRORS.ZERO_ADDRESS}`, async () => {
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
                                    ADDRESS_ZERO,
                                    tokenA.address
                                ]
                            }
                        ]

                        await expect(trader.execute(encodeRoute(ONE, ZERO, route))).to.be.revertedWith(ERRORS.ZERO_ADDRESS)
                    })
                })

                describe('when path is inconsistent', () => {
                    it(`reverts with ${ERRORS.INCONSISTENT_ROUTE}`, async () => {
                        const route: SinglePath[] = [
                            {
                                router: router0.address,
                                tokens: [
                                    tokenA.address,
                                    tokenB.address,
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

                        await expect(trader.execute(encodeRoute(ONE, ZERO, route))).to.be.revertedWith(ERRORS.INCONSISTENT_ROUTE)
                    })
                })
            })
        })
    })
})