import { expect } from "chai";
import hre, { ethers } from "hardhat";

import { deployTestFixture } from "@/test";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, BytesLike, Contract, ContractTransaction } from "ethers/lib/ethers";

// ESSENTIAL TO IMPORT THIS
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { encodeFlashloanData, encodeRoute, epsEqual, randomAddress, SinglePath } from "./helper";
import { FlashLoanTaker, FlashLoanTaker__factory, Reentrancy__factory, TestToken, TestTrader, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from "@/typechain";
import { ERRORS } from "./Errors";

describe('FlashloanTaker', () => {
    let deployer: SignerWithAddress
    let user0: SignerWithAddress
    let user1: SignerWithAddress
    let owner: SignerWithAddress
    let flashLoan: FlashLoanTaker
    let pair: UniswapV2Pair
    let factory: UniswapV2Factory
    let router: UniswapV2Router02
    let trader: TestTrader
    let token0: TestToken
    let token1: TestToken
    let flashloanFactory: FlashLoanTaker__factory

    const ONE = ethers.constants.WeiPerEther
    const ADDRESS_ZERO = ethers.constants.AddressZero
    const deadline = BigNumber.from(10).pow(10)
    const wallet = randomAddress()
    const ZERO = BigNumber.from(0)

    beforeEach(async function () {
        const state = await loadFixture(deployTestFixture)

        deployer = state.signers.deployer
        user0 = state.signers.user0
        user1 = state.signers.user1
        owner = state.signers.owner

        token0 = state.testTokenA
        token1 = state.testTokenB

        pair = state.testPair
        factory = state.uniswapV2Factory
        router = state.uniswapV2Router

        trader = state.testTrader
        flashLoan = state.flashLoanTaker

        flashloanFactory = state.factories.flashLoanTakerFactory
    });

    const getPair = async (tokenA: Contract = token0, tokenB: Contract = token1, swapFactory = factory) => {
        const address = await swapFactory.getPair(tokenA.address, tokenB.address)
        return await ethers.getContractAt<UniswapV2Pair>('UniswapV2Pair', address)
    }

    const getTargetAmount = async (amountOut: BigNumber, path: string[], router: UniswapV2Router02) => {
        // target amount => amountsIn[0]
        // amountOut => amountsIn.last

        const amountsIn = await router.getAmountsIn(amountOut, path)
        return amountsIn[0]
    }

    it('allows to take a flash swap in token0', async () => {
        const reserves = await pair.getReserves()
        expect(reserves[0]).eq(ONE.mul(100_000))
        expect(reserves[1]).eq(ONE.mul(100_000))

        const route: SinglePath[] = [
            {
                router: router.address,
                tokens: [token0.address, token1.address],
            }
        ]

        const routeData = encodeRoute(ONE, ZERO, route)

        const flashloanData = encodeFlashloanData(router.address)

        // set profit = amountIn on the test trader
        const amountIn = await getTargetAmount(ONE, [token1.address, token0.address], router)
        await trader.setTargetAmount(amountIn)

        // take tokenA to get profit in tokenB
        const profit = await flashLoan.connect(owner).callStatic.executeFlashSwap(flashloanData, routeData)
        const profitFix = await trader.PROFIT_FIX()
        expect(profit).eq(profitFix)

        await flashLoan.connect(owner).executeFlashSwap(flashloanData, routeData)

        const reservesAfter = await pair.getReserves()
        expect(reservesAfter[0]).eq(reserves[0].sub(ONE))
        expect(reservesAfter[1]).eq(reserves[1].add(amountIn))
    })

    it('allows to take a flash swap in token1', async () => {
        const reserves = await pair.getReserves()
        expect(reserves[0]).eq(ONE.mul(100_000))
        expect(reserves[1]).eq(ONE.mul(100_000))

        const route: SinglePath[] = [
            {
                router: router.address,
                tokens: [token1.address, token0.address],
            }
        ]

        const routeData = encodeRoute(ONE, ZERO, route)
        const flashloanData = encodeFlashloanData(router.address)

        // set profit = amountIn on the test trader
        const amountIn = await getTargetAmount(ONE, [token0.address, token1.address], router)
        await trader.setTargetAmount(amountIn)

        // take tokenA to get profit in tokenB
        const profit = await flashLoan.connect(owner).callStatic.executeFlashSwap(flashloanData, routeData)
        const profitFix = await trader.PROFIT_FIX()
        expect(profit).eq(profitFix)

        await flashLoan.connect(owner).executeFlashSwap(flashloanData, routeData)

        const reservesAfter = await pair.getReserves()
        expect(reservesAfter[1]).eq(reserves[1].sub(ONE))
        expect(reservesAfter[0]).eq(reserves[0].add(amountIn))
    })

    describe('edge cases', () => {
        describe('when flash swap called not from owner', () => {
            it(`reverts with ${ERRORS.NOT_OWNER}`, async () => {
                await expect(flashLoan.connect(user0).executeFlashSwap([], [])).to.be.revertedWith(ERRORS.NOT_OWNER)
            })
        })

        describe('when flashloan router == 0x0', () => {
            it(`reverts with ${ERRORS.ADDRESS_ZERO}`, async () => {
                const route: SinglePath[] = [
                    {
                        router: router.address,
                        tokens: [token0.address, token1.address]
                    }
                ]
                const routeData = encodeRoute(ONE, ZERO, route)
                const loanData = encodeFlashloanData(ADDRESS_ZERO)
                await expect(flashLoan.connect(owner).executeFlashSwap(loanData, routeData)).to.be.revertedWith(ERRORS.ADDRESS_ZERO)
            })
        })

        describe('when pair does not exist', () => {
            it(`reverts with ${ERRORS.NOT_EXISTS}`, async () => {
                const reserves = await pair.getReserves()
                expect(reserves[0]).eq(ONE.mul(100_000))
                expect(reserves[1]).eq(ONE.mul(100_000))

                const route: SinglePath[] = [
                    {
                        router: router.address,
                        tokens: [token1.address, randomAddress()],
                    }
                ]

                const routeData = encodeRoute(ONE, ZERO, route)
                const flashloanData = encodeFlashloanData(router.address)

                // take tokenA to get profit in tokenB
                await expect(flashLoan.connect(owner).executeFlashSwap(flashloanData, routeData)).to.be.revertedWith(ERRORS.NOT_EXISTS)
            })
        })

        describe('when created with 0x0 trader', () => {
            it(`reverts with ${ERRORS.ADDRESS_ZERO}`, async () => {
                await expect(flashloanFactory.deploy(ADDRESS_ZERO)).to.be.reverted
            })
        })

        describe('when trade did not make any profit', () => {
            it(`reverts with ${ERRORS.NO_PROFIT}`, async () => {
                const reserves = await pair.getReserves()
                expect(reserves[0]).eq(ONE.mul(100_000))
                expect(reserves[1]).eq(ONE.mul(100_000))

                const route: SinglePath[] = [
                    {
                        router: router.address,
                        tokens: [token0.address, token1.address],
                    }
                ]

                const routeData = encodeRoute(ONE.mul(100), ZERO, route)
                const flashloanData = encodeFlashloanData(router.address)

                // set profit = amountIn on the test trader
                const amountIn = await getTargetAmount(ONE.mul(100), [token1.address, token0.address], router)

                // Pair needs at least amountIn tokens in return from flashswap callback

                const profitFix = await trader.PROFIT_FIX()
                // profit set to 0
                await trader.setTargetAmount(amountIn.sub(profitFix))

                // take tokenA to get profit in tokenB
                await expect(flashLoan.connect(owner).executeFlashSwap(flashloanData, routeData)).to.be.revertedWith(ERRORS.NO_PROFIT)

                // profit set to -1
                await trader.setTargetAmount(amountIn.sub(profitFix).sub(1))

                // take tokenA to get profit in tokenB
                await expect(flashLoan.connect(owner).executeFlashSwap(flashloanData, routeData)).to.be.revertedWith(ERRORS.NO_PROFIT)
            })
        })

        describe('when uniswapV2Call caller is not pair', () => {
            it(`reverts with ${ERRORS.WRONG_CALLER}`, async () => {
                const reserves = await pair.getReserves()
                expect(reserves[0]).eq(ONE.mul(100_000))
                expect(reserves[1]).eq(ONE.mul(100_000))

                const route: SinglePath[] = [
                    {
                        router: router.address,
                        tokens: [token0.address, token1.address],
                    }
                ]

                const routeData = encodeRoute(ONE.mul(100), ZERO, route)

                // set profit = amountIn on the test trader
                const amountIn = await getTargetAmount(ONE.mul(100), [token1.address, token0.address], router)

                // Pair needs at least amountIn tokens in return from flashswap callback

                const profitFix = await trader.PROFIT_FIX()
                // profit set to 0
                await trader.setTargetAmount(amountIn.sub(profitFix))

                // take tokenA to get profit in tokenB
                const coder = new ethers.utils.AbiCoder()
                const callData = coder.encode(["address", "uint256", "bytes memory"], [router.address, amountIn, routeData])
                await expect(flashLoan.connect(owner).uniswapV2Call(flashLoan.address, 0, 1, callData)).to.be.revertedWith(ERRORS.WRONG_CALLER)
            })
        })

        describe('when uniswapV2Call sender is not flashloan taker', () => {
            it(`reverts with ${ERRORS.NOT_ALLOWED}`, async () => {
                const reserves = await pair.getReserves()
                expect(reserves[0]).eq(ONE.mul(100_000))
                expect(reserves[1]).eq(ONE.mul(100_000))

                const route: SinglePath[] = [
                    {
                        router: router.address,
                        tokens: [token0.address, token1.address],
                    }
                ]

                const routeData = encodeRoute(ONE.mul(100), ZERO, route)

                // set profit = amountIn on the test trader
                const amountIn = await getTargetAmount(ONE.mul(100), [token1.address, token0.address], router)

                // Pair needs at least amountIn tokens in return from flashswap callback

                const profitFix = await trader.PROFIT_FIX()
                // profit set to 0
                await trader.setTargetAmount(amountIn.sub(profitFix))

                // take tokenA to get profit in tokenB
                const coder = new ethers.utils.AbiCoder()
                const callData = coder.encode(["address", "uint256", "bytes memory"], [router.address, amountIn, routeData])
                await expect(flashLoan.connect(owner).uniswapV2Call(owner.address, 0, 1, callData)).to.be.revertedWith(ERRORS.NOT_ALLOWED)
            })
        })

        describe('when reentrancy in uniswapV2Call', () => {
            it(`reverts with ${ERRORS.REENTRANCY}`, async () => {
                const reentrancyFactory = await ethers.getContractFactory<Reentrancy__factory>("Reentrancy")
                const reentrancy = await reentrancyFactory.deploy()

                await flashLoan.connect(owner).setTrader(reentrancy.address)

                const reserves = await pair.getReserves()
                expect(reserves[0]).eq(ONE.mul(100_000))
                expect(reserves[1]).eq(ONE.mul(100_000))

                const route: SinglePath[] = [
                    {
                        router: router.address,
                        tokens: [token0.address, token1.address],
                    }
                ]

                const routeData = encodeRoute(ONE.mul(100), ZERO, route)
                const flashloanData = encodeFlashloanData(router.address)

                // set profit = amountIn on the test trader
                const amountIn = await getTargetAmount(ONE.mul(100), [token1.address, token0.address], router)

                // take tokenA to get profit in tokenB
                await expect(flashLoan.connect(owner).executeFlashSwap(flashloanData, routeData)).to.be.revertedWith(ERRORS.REENTRANCY)
            })
        })
    })

    describe('setTrader', () => {
        it('sets new trader contract', async () => {
            expect(await flashLoan.trader()).eq(trader.address)

            await flashLoan.connect(owner).setTrader(token0.address)

            expect(await flashLoan.trader()).eq(token0.address)
        })

        describe('edge cases', () => {
            describe('when new trader == old trader', () => {
                it(`reverts with ${ERRORS.DUPLICATE}`, async () => {
                    await expect(flashLoan.connect(owner).setTrader(trader.address)).to.be.revertedWith(ERRORS.DUPLICATE)
                })
            })

            describe('when called not from owner', () => {
                it(`reverts with ${ERRORS.NOT_OWNER}`, async () => {
                    await expect(flashLoan.connect(user0).setTrader(randomAddress())).to.be.revertedWith(ERRORS.NOT_OWNER)
                })
            })

            describe('when new trader is EOA', () => {
                it(`reverts with ${ERRORS.NOT_CONTRACT}`, async () => {
                    await expect(flashLoan.connect(owner).setTrader(randomAddress())).to.be.revertedWith(ERRORS.NOT_CONTRACT)
                })
            })
        })
    })
})