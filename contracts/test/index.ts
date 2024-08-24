import { BigNumber } from 'ethers/lib/ethers'
import { deployments, ethers } from 'hardhat'
import { randomAddress } from './helper'
import { FlashloanTaker__factory, TestToken__factory, TestTrader__factory, Token__factory, UniswapV2Factory, UniswapV2Factory__factory, UniswapV2Pair, UniswapV2Router02, UniswapV2Router02__factory, WETH__factory } from '@/typechain'

import { abi as FACTORY_ABI, bytecode as FACTORY_BYTECODE } from '@uniswap/v2-core/build/UniswapV2Factory.json'
import { abi as ROUTER_ABI, bytecode as ROUTER_BYTECODE } from '@uniswap/v2-periphery/build/UniswapV2Router02.json'

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

    const flashloanTakerFactory = await ethers.getContractFactory<FlashloanTaker__factory>('FlashloanTaker')
    const flashloanTaker = await flashloanTakerFactory.deploy(uniswapV2Router.address, testTrader.address)
    await flashloanTaker.transferOwnership(signers.owner.address)

    return {
        signers,
        factories: {
            uniswapFactories: factories,
            testTokenFactory,
            testTraderFactory,
            flashloanTakerFactory
        },
        uniswapV2Factory, uniswapV2Router, weth,
        testTokenA, testTokenB, testPair,
        testTrader, flashloanTaker
    }
}

