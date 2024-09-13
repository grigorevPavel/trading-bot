import { BigNumber } from 'ethers/lib/ethers'
import { deployments, ethers } from 'hardhat'
import { enableInitializer, randomAddress } from './helper'
import { Arbitrage__factory, FlashLoanTaker__factory, TestToken__factory, TestTrader__factory, Token__factory, UniswapV2Factory, UniswapV2Factory__factory, UniswapV2Pair, UniswapV2Router02, UniswapV2Router02__factory, UniswapV2Trader__factory, WETH__factory } from '@/typechain'

import { abi as FACTORY_ABI, bytecode as FACTORY_BYTECODE } from '@uniswap/v2-core/build/UniswapV2Factory.json'
import { abi as ROUTER_ABI, bytecode as ROUTER_BYTECODE } from '@uniswap/v2-periphery/build/UniswapV2Router02.json'
import { Trader__factory } from '@/typechain/factories/Trader__factory'

export const getSigners = async () => {
    const [deployer, user0, user1, owner] = await ethers.getSigners()
    return {
        deployer,
        user0,
        user1,
        owner
    }
}

export async function deployUniswapFixture() {
    const signers = await getSigners()
    const wethFactory = await ethers.getContractFactory<WETH__factory>('WETH')
    const weth = await wethFactory.deploy()

    const uniswapFactoryFactory = new ethers.ContractFactory(FACTORY_ABI, FACTORY_BYTECODE) as UniswapV2Factory__factory
    const uniswapV2Factory = await uniswapFactoryFactory.connect(signers.deployer).deploy(signers.deployer.address) as UniswapV2Factory

    const uniswapRouterFactory = new ethers.ContractFactory(ROUTER_ABI, ROUTER_BYTECODE) as UniswapV2Router02__factory
    const uniswapV2Router = await uniswapRouterFactory.connect(signers.deployer).deploy(uniswapV2Factory.address, weth.address) as UniswapV2Router02

    return {
        signers: signers,
        factories: {
            uniswapFactoryFactory,
            uniswapRouterFactory,
            wethFactory
        },
        weth, uniswapV2Factory, uniswapV2Router
    }
}


export async function deployTestFixture() {
    const {
        signers,
        factories,
        weth, uniswapV2Factory, uniswapV2Router
    } = await deployUniswapFixture()

    const testTokenFactory = await ethers.getContractFactory<TestToken__factory>('TestToken')
    const testTokenA = await testTokenFactory.connect(signers.deployer).deploy()
    const testTokenB = await testTokenFactory.connect(signers.deployer).deploy()

    const ONE = ethers.constants.WeiPerEther
    const deadline = BigNumber.from(10).pow(10)

    await testTokenA.connect(signers.deployer).openMint(signers.deployer.address, ONE.mul(100_000))
    await testTokenB.connect(signers.deployer).openMint(signers.deployer.address, ONE.mul(100_000))

    await testTokenA.connect(signers.deployer).approve(uniswapV2Router.address, ONE.mul(100_000))
    await testTokenB.connect(signers.deployer).approve(uniswapV2Router.address, ONE.mul(100_000))

    await uniswapV2Router.connect(signers.deployer).addLiquidity(
        testTokenA.address,
        testTokenB.address,
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        signers.deployer.address,
        deadline
    )

    //await uniswapV2Factory.createPair(testTokenA.address, testTokenB.address)

    const testPair = await ethers.getContractAt<UniswapV2Pair>(
        'UniswapV2Pair',
        await uniswapV2Factory.getPair(testTokenA.address, testTokenB.address)
    )

    const testTraderFactory = await ethers.getContractFactory<TestTrader__factory>('TestTrader')
    const testTrader = await testTraderFactory.deploy()

    const flashLoanTakerFactory = await ethers.getContractFactory<FlashLoanTaker__factory>('FlashLoanTaker')
    const flashLoanTaker = await flashLoanTakerFactory.deploy(testTrader.address)
    await flashLoanTaker.transferOwnership(signers.owner.address)

    await flashLoanTaker.connect(signers.owner).setExecutor(signers.owner.address)

    return {
        signers,
        factories: {
            uniswapFactories: factories,
            testTokenFactory,
            testTraderFactory,
            flashLoanTakerFactory
        },
        uniswapV2Factory, uniswapV2Router, weth,
        testTokenA, testTokenB, testPair,
        testTrader, flashLoanTaker
    }
}

export async function deployTraderFixture() {
    const baseUniswapState = await deployUniswapFixture()
    const signers = baseUniswapState.signers

    const tokenFactory = await ethers.getContractFactory<Token__factory>('Token')
    const tokenA = await tokenFactory.connect(signers.deployer).deploy()
    const tokenB = await tokenFactory.connect(signers.deployer).deploy()
    const tokenC = await tokenFactory.connect(signers.deployer).deploy()
    const tokenD = await tokenFactory.connect(signers.deployer).deploy()

    const uniFactoryFactory = baseUniswapState.factories.uniswapFactoryFactory
    const uniRouterFactory = baseUniswapState.factories.uniswapRouterFactory

    const newFactory = await uniFactoryFactory.connect(signers.deployer).deploy(signers.deployer.address)
    const newRouter = await uniRouterFactory.connect(signers.deployer).deploy(newFactory.address, baseUniswapState.weth.address)

    const factory = baseUniswapState.uniswapV2Factory
    const router = baseUniswapState.uniswapV2Router

    const traderFactory = await ethers.getContractFactory<UniswapV2Trader__factory>('UniswapV2Trader')
    const trader = await traderFactory.connect(signers.deployer).deploy()

    // create pairs
    const ONE = ethers.constants.WeiPerEther
    const deadline = BigNumber.from(10).pow(10)

    await tokenA.connect(signers.deployer).mint(signers.deployer.address, ONE.mul(200_000))
    await tokenB.connect(signers.deployer).mint(signers.deployer.address, ONE.mul(200_000))

    await tokenC.connect(signers.deployer).mint(signers.deployer.address, ONE.mul(200_000))
    await tokenD.connect(signers.deployer).mint(signers.deployer.address, ONE.mul(200_000))

    await tokenA.connect(signers.deployer).approve(router.address, ONE.mul(100_000))
    await tokenB.connect(signers.deployer).approve(router.address, ONE.mul(100_000))

    await tokenB.connect(signers.deployer).approve(newRouter.address, ONE.mul(100_000))
    await tokenC.connect(signers.deployer).approve(newRouter.address, ONE.mul(200_000))
    await tokenD.connect(signers.deployer).approve(newRouter.address, ONE.mul(200_000))
    await tokenA.connect(signers.deployer).approve(newRouter.address, ONE.mul(100_000))

    const MANAGER_ROLE = await trader.MANAGER_ROLE()
    const EXECUTOR_ROLE = await trader.EXECUTOR_ROLE()

    await trader.connect(signers.deployer).grantRole(MANAGER_ROLE, signers.deployer.address)
    await trader.connect(signers.deployer).grantRole(EXECUTOR_ROLE, signers.deployer.address)

    // R1 (A, B)
    await router.connect(signers.deployer).addLiquidity(
        tokenA.address, 
        tokenB.address, 
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        signers.deployer.address,
        deadline
    )

    // R2 (B, C)
    await newRouter.connect(signers.deployer).addLiquidity(
        tokenB.address, 
        tokenC.address, 
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        signers.deployer.address,
        deadline
    )

    // R2 (C, D)
    await newRouter.connect(signers.deployer).addLiquidity(
        tokenC.address, 
        tokenD.address, 
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        signers.deployer.address,
        deadline
    )

    // R2 (D, A)
    await newRouter.connect(signers.deployer).addLiquidity(
        tokenD.address, 
        tokenA.address, 
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        signers.deployer.address,
        deadline
    )

    return {
        signers,
        tokens: [tokenA, tokenB, tokenC, tokenD],
        trader, traderFactory,
        router0: router, 
        router1: newRouter,
        factory0: factory,
        factory1: newFactory
    }
}

export async function deployArbitrageFixture() {
    const baseUniswapState = await deployUniswapFixture()
    const signers = baseUniswapState.signers

    const tokenFactory = await ethers.getContractFactory<Token__factory>('Token')
    const token = await tokenFactory.connect(signers.deployer).deploy()
    const usdt = await tokenFactory.connect(signers.deployer).deploy()

    const uniFactoryFactory = baseUniswapState.factories.uniswapFactoryFactory
    const uniRouterFactory = baseUniswapState.factories.uniswapRouterFactory

    const newFactory = await uniFactoryFactory.connect(signers.deployer).deploy(signers.deployer.address)
    const newRouter = await uniRouterFactory.connect(signers.deployer).deploy(newFactory.address, baseUniswapState.weth.address)

    const factory = baseUniswapState.uniswapV2Factory
    const router = baseUniswapState.uniswapV2Router

    const traderFactory = await ethers.getContractFactory<UniswapV2Trader__factory>('UniswapV2Trader')
    const trader = await traderFactory.connect(signers.deployer).deploy()

    // create pairs
    const ONE = ethers.constants.WeiPerEther
    const deadline = BigNumber.from(10).pow(10)

    await token.connect(signers.deployer).mint(signers.deployer.address, ONE.mul(200_000))
    await usdt.connect(signers.deployer).mint(signers.deployer.address, ONE.mul(200_000))

    await token.connect(signers.deployer).approve(router.address, ONE.mul(100_000))
    await usdt.connect(signers.deployer).approve(router.address, ONE.mul(100_000))

    await token.connect(signers.deployer).approve(newRouter.address, ONE.mul(100_000))
    await usdt.connect(signers.deployer).approve(newRouter.address, ONE.mul(100_000))

    // R1 (A, B)
    await router.connect(signers.deployer).addLiquidity(
        token.address, 
        usdt.address, 
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        signers.deployer.address,
        deadline
    )

    // R2 (A, B)
    await newRouter.connect(signers.deployer).addLiquidity(
        token.address, 
        usdt.address, 
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        ONE.mul(100_000),
        signers.deployer.address,
        deadline
    )

    const MANAGER_ROLE = await trader.MANAGER_ROLE()
    const EXECUTOR_ROLE = await trader.EXECUTOR_ROLE()

    await trader.connect(signers.deployer).grantRole(MANAGER_ROLE, signers.deployer.address)

    const flashloanFactory = await ethers.getContractFactory<FlashLoanTaker__factory>('FlashLoanTaker')

    const flashloan = await flashloanFactory.deploy(trader.address)
    await trader.connect(signers.deployer).grantRole(EXECUTOR_ROLE, flashloan.address)
    await flashloan.transferOwnership(signers.owner.address)

    const arbitrageFactory = await ethers.getContractFactory<Arbitrage__factory>('Arbitrage')

    const arbitrage = await arbitrageFactory.deploy()

    await flashloan.connect(signers.owner).setExecutor(arbitrage.address)
    await enableInitializer(arbitrage.address)

    await arbitrage.init(flashloan.address)
    await arbitrage.transferOwnership(signers.owner.address)

    return {
        signers,
        tokens: [token, usdt],
        trader, traderFactory,
        router0: router, 
        router1: newRouter,
        factory0: factory,
        factory1: newFactory,
        flashloan, flashloanFactory,
        arbitrage, arbitrageFactory
    }
}

