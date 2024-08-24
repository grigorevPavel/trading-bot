import { expect } from "chai";
import hre, { ethers } from "hardhat";

import { deployTestFixture } from "@/test";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { BigNumber, BytesLike, Contract, ContractTransaction } from "ethers/lib/ethers";

// ESSENTIAL TO IMPORT THIS
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { randomAddress } from "./helper";
import { FlashloanTaker, TestToken, TestTrader, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from "@/typechain";

describe('VirtualDex::SwapFactory', () => {
    let deployer: SignerWithAddress
    let user0: SignerWithAddress
    let user1: SignerWithAddress
    let flashloan: FlashloanTaker
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

        token0 = state.testTokenA
        token1 = state.testTokenB

        pair = state.testPair
        factory = state.uniswapV2Factory
        router = state.uniswapV2Router
       
        trader = state.testTrader
        flashloan = state.flashloanTaker
    });

    const getPair = async (tokenA: Contract = token0, tokenB: Contract = token1, swapFactory = factory) => {
        const address = await swapFactory.getPair(tokenA.address, tokenB.address)
        return await ethers.getContractAt<UniswapV2Pair>('UniswapV2Pair', address)
    }

    it('allows to take a flash swap', async () => {
        
    })
})