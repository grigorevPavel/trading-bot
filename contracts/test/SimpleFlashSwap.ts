import { expect } from "chai";
import hre, { ethers } from "hardhat";

import { deployTestFixture } from "@/test";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, BytesLike, Contract, ContractTransaction } from "ethers/lib/ethers";

// ESSENTIAL TO IMPORT THIS
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { encodeRoute, epsEqual, randomAddress, SinglePath } from "./helper";
import { FlashLoanTaker, TestToken, TestTrader, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from "@/typechain";

describe('VirtualDex::SwapFactory', () => {
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

    const ONE = ethers.constants.WeiPerEther
    const ADDRESS_ZERO = ethers.constants.AddressZero
    const deadline = BigNumber.from(10).pow(10)
    const wallet = randomAddress()

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

    it('allows to take a flash swap', async () => {
        const reserves = await pair.getReserves()
        expect(reserves[0]).eq(ONE.mul(100_000))
        expect(reserves[1]).eq(ONE.mul(100_000))

        const route: SinglePath[] = [
            {
                router: router.address,
                tokens: [token0.address],
            },
            {
                router: randomAddress(),
                tokens: [token1.address],
            }
        ]

        const routeData = encodeRoute(ONE, route)
        
        // set profit = amountIn on the test trader
        const amountIn = await getTargetAmount(ONE, [token1.address, token0.address], router)
        await trader.setTargetAmount(amountIn)

        // take tokenA to get profit in tokenB
        const profit = await flashLoan.connect(owner).callStatic.executeFlashSwap(routeData)
        const profitFix = await trader.PROFIT_FIX()
        expect(profit).eq(profitFix)

        await flashLoan.connect(owner).executeFlashSwap(routeData)

        const reservesAfter = await pair.getReserves()
        expect(reservesAfter[0]).eq(reserves[0].sub(ONE))
        expect(reservesAfter[1]).eq(reserves[1].add(amountIn))
    })
})