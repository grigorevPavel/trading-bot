import { expect } from "chai";
import hre, { ethers } from "hardhat";

import { deployArbitrageFixture, deployTestFixture, deployTraderFixture } from "@/test";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, BytesLike, Contract, ContractTransaction } from "ethers/lib/ethers";

// ESSENTIAL TO IMPORT THIS
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { enableInitializer, encodeRoute, epsEqual, randomAddress, SinglePath } from "./helper";
import { Arbitrage, Arbitrage__factory, FlashLoanTaker, FlashLoanTaker__factory, Reentrancy__factory, Token, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02, UniswapV2Trader, UniswapV2Trader__factory } from "@/typechain";
import { ERRORS } from "./Errors";

describe('Arbitrage', () => {
    let deployer: SignerWithAddress
    let user0: SignerWithAddress
    let user1: SignerWithAddress
    let owner: SignerWithAddress
    let token: Token
    let usdt: Token
    let factory0: UniswapV2Factory
    let factory1: UniswapV2Factory
    let router0: UniswapV2Router02
    let router1: UniswapV2Router02
    let trader: UniswapV2Trader
    let traderFactory: UniswapV2Trader__factory
    let arbitrage: Arbitrage
    let arbitrageFactory: Arbitrage__factory
    let flashLoan: FlashLoanTaker
    let flashLoanFactory: FlashLoanTaker__factory

    const ONE = ethers.constants.WeiPerEther
    const ADDRESS_ZERO = ethers.constants.AddressZero
    const deadline = BigNumber.from(10).pow(10)
    const wallet = randomAddress()
    const ZERO = BigNumber.from(0)

    const slippage = BigNumber.from(50)

    beforeEach(async function () {
        const state = await loadFixture(deployArbitrageFixture)

        deployer = state.signers.deployer
        user0 = state.signers.user0
        user1 = state.signers.user1
        owner = state.signers.owner

            ;[token, usdt] = state.tokens

        factory0 = state.factory0
        factory1 = state.factory1
        router0 = state.router0
        router1 = state.router1

        trader = state.trader
        traderFactory = state.traderFactory

        arbitrage = state.arbitrage
        arbitrageFactory = state.arbitrageFactory

        flashLoan = state.flashloan
        flashLoanFactory = state.flashloanFactory
    });

    const getPair = async (token0: Contract, token1: Contract, router: UniswapV2Router02) => {
        const factory = await ethers.getContractAt<UniswapV2Factory>('UniswapV2Factory', await router.factory())
        const address = await factory.getPair(token0.address, token1.address)
        return await ethers.getContractAt<UniswapV2Pair>('UniswapV2Pair', address)
    }

    const logReserves = async (tokenFirst: Contract, tokenSecond: Contract, pair: UniswapV2Pair) => {
        const token0 = await pair.token0()

        const {_reserve0, _reserve1} = await pair.getReserves()

        if (token0.toLowerCase() === tokenFirst.address.toLowerCase()) {
            console.log(`Reserves: ${_reserve0} | ${_reserve1}`)
        } else {
            console.log(`Reserves: ${_reserve1} | ${_reserve0}`)
        }
    }

    const getTargetAmount = async (amountOut: BigNumber, path: string[], router: UniswapV2Router02) => {
        // target amount => amountsIn[0]
        // amountOut => amountsIn.last

        const amountsIn = await router.getAmountsIn(amountOut, path)
        return amountsIn[0]
    }

    describe('constructor', () => {
        it('creates new contract', async () => {
            const newArbitrage = await arbitrageFactory.deploy()
            expect(newArbitrage.address).not.eq(ADDRESS_ZERO)
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

    describe('init', () => {
        let newArbitrage: Arbitrage
        beforeEach(async () => {
            newArbitrage = await arbitrageFactory.deploy()
        })

        it('inits a new arbitrage contract', async () => {
            enableInitializer(newArbitrage.address)

            await newArbitrage.connect(owner).init(flashLoan.address)
            expect(await newArbitrage.flashloan()).eq(flashLoan.address)
            expect(await newArbitrage.owner()).eq(owner.address)
        })

        describe('edge cases', () => {
            describe('when initializers disabled', () => {
                it(`reverts with ${ERRORS.INIT_LOCKED}`, async () => {
                    await expect(newArbitrage.connect(owner).init(flashLoan.address)).revertedWith(ERRORS.INIT_LOCKED)
                })
            })

            describe('when flashloan == 0x0', () => {
                it(`reverts with ${ERRORS.ADDRESS_ZERO}`, async () => {
                    await enableInitializer(newArbitrage.address)
                    await expect(newArbitrage.connect(owner).init(ADDRESS_ZERO)).revertedWith(ERRORS.ADDRESS_ZERO)
                })
            })
        })
    })

    describe('setFlashloan', () => {
        it('allows to reset flashloan address', async () => {
            expect(await arbitrage.flashloan()).eq(flashLoan.address)
            const newFlashloan = randomAddress()
            await arbitrage.connect(owner).resetFlashloan(newFlashloan)
            expect(await arbitrage.flashloan()).eq(newFlashloan)
        })

        describe('edge cases', () => {
            describe('when called not by owner', async () => {
                it(`reverts with ${ERRORS.NOT_OWNER}`, async () => {
                    await expect(arbitrage.connect(user0).resetFlashloan(randomAddress())).revertedWith(ERRORS.NOT_OWNER)
                })
            })

            describe('when new flashloan == 0x0', async () => {
                it(`reverts with ${ERRORS.ADDRESS_ZERO}`, async () => {
                    await expect(arbitrage.connect(owner).resetFlashloan(ADDRESS_ZERO)).revertedWith(ERRORS.ADDRESS_ZERO)
                })
            })

            describe('when new flashloan == old flashloan', async () => {
                it(`reverts with ${ERRORS.DUPLICATE}`, async () => {
                    await expect(arbitrage.connect(owner).resetFlashloan(flashLoan.address)).revertedWith(ERRORS.DUPLICATE)
                })
            })
        })
    })

    const buyTokens = async (user:SignerWithAddress, router: UniswapV2Router02, tokenIn: Token, tokenOut: Token, amountIn: BigNumber) => {
        await tokenIn.connect(user).approve(router.address, amountIn)
        await router.connect(user).swapExactTokensForTokens(amountIn, ZERO, [tokenIn.address, tokenOut.address], user.address, deadline)
    }

    const calcMaxArbitrageAmount = async (pair0: UniswapV2Pair, pair1: UniswapV2Pair) => {
        
    }

    describe('makeArbitrage', () => {
        it('executes arbitrage if a profitable opportunity is found off chain', async () => {
            // make price difference on 2 exchanges
            const delta = ONE.mul(1000)
            await token.mint(user0.address, delta)

            // buy 100 usdt for token
            // token is cheaper in router0 than in router1
            // price in router1 = 1:1
            // price in router0 = (100_000 + 1000) / (100_000 - 999.6) = 100_100 / 99_000
           
            await buyTokens(user0, router0, token, usdt, delta)

            const pair0 = await getPair(usdt, token, router0)
            const pair1 = await getPair(usdt, token, router1)

            await logReserves(usdt, token, pair0)
            await logReserves(usdt, token, pair1)

            // const amountsTKN = await router0.getAmountsOut(ONE, [usdt.address, token.address])
            // const amountToken = amountsTKN[amountsTKN.length - 1]
            // console.log(amountToken.toString())

            // const amountsUSDT = await router1.getAmountsOut(amountToken, [token.address, usdt.address])
            // const amountUSDT = amountsUSDT[amountsUSDT.length - 1]
            // console.log(amountUSDT.toString())

            // buy token for USDT on exchange 0 and sell on exchange 1 for USDT
            // USDT will be taken with flashloan

            const route: SinglePath[] = [
                {
                    // flashswap path
                    router: router0.address,
                    tokens: [usdt.address, token.address]
                },
                {
                    // trader path
                    router: router1.address,
                    tokens: [token.address, usdt.address]
                }
            ]

            const arbitrageAmount = ONE
            const expectedOut = await getRouteAmountOut(arbitrageAmount, route)
            
            const usdtBefore = await usdt.balanceOf(arbitrage.address)
            await arbitrage.connect(owner).makeArbitrage(true, arbitrageAmount, ZERO, route)
            const usdtAfter = await usdt.balanceOf(arbitrage.address)

            expect(expectedOut.sub(arbitrageAmount)).eq(usdtAfter.sub(usdtBefore))

            await logReserves(usdt, token, pair0)
            await logReserves(usdt, token, pair1)
        })

        it.only('executes arbitrage if prices become ~equal after swap', async () => {
            // make price difference on 2 exchanges
            const delta = ONE.mul(1000)
            await token.mint(user0.address, delta)

            // buy 100 usdt for token
            // token is cheaper in router0 than in router1
            // price in router1 = 1:1
            // price in router0 = (100_000 + 1000) / (100_000 - 999.6) = 100_100 / 99_000
           
            await buyTokens(user0, router0, token, usdt, delta)

            const pair0 = await getPair(usdt, token, router0)
            const pair1 = await getPair(usdt, token, router1)

            await logReserves(usdt, token, pair0)
            await logReserves(usdt, token, pair1)

            // const amountsTKN = await router0.getAmountsOut(ONE, [usdt.address, token.address])
            // const amountToken = amountsTKN[amountsTKN.length - 1]
            // console.log(amountToken.toString())

            // const amountsUSDT = await router1.getAmountsOut(amountToken, [token.address, usdt.address])
            // const amountUSDT = amountsUSDT[amountsUSDT.length - 1]
            // console.log(amountUSDT.toString())

            // buy token for USDT on exchange 0 and sell on exchange 1 for USDT
            // USDT will be taken with flashloan

            const route: SinglePath[] = [
                {
                    // flashswap path
                    router: router0.address,
                    tokens: [usdt.address, token.address]
                },
                {
                    // trader path
                    router: router1.address,
                    tokens: [token.address, usdt.address]
                }
            ]

            const arbitrageAmount = ONE
            const expectedOut = await getRouteAmountOut(arbitrageAmount, route)
            
            const usdtBefore = await usdt.balanceOf(arbitrage.address)
            await arbitrage.connect(owner).makeArbitrage(true, arbitrageAmount, ZERO, route)
            const usdtAfter = await usdt.balanceOf(arbitrage.address)

            expect(expectedOut.sub(arbitrageAmount)).eq(usdtAfter.sub(usdtBefore))

            await logReserves(usdt, token, pair0)
            await logReserves(usdt, token, pair1)
        })
    })
})