import { Arbitrage, FlashLoanTaker, UniswapV2Trader } from "@/typechain"
import { ethers } from "hardhat"
import type { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async (hre) => {
    const [deployer] = await ethers.getSigners()
    const {deployments} = hre
    const {deploy} = deployments

    const flashloan = await ethers.getContract<FlashLoanTaker>('FlashLoanTaker')
    const trader = await ethers.getContract<UniswapV2Trader>('UniswapV2Trader')
    const arbitrage = await ethers.getContract<Arbitrage>('Arbitrage')

    const MANAGER_ROLE = await trader.MANAGER_ROLE()
    const EXECUTOR_ROLE = await trader.EXECUTOR_ROLE()

    await trader.connect(deployer).grantRole(MANAGER_ROLE, deployer.address)
    await trader.connect(deployer).grantRole(EXECUTOR_ROLE, flashloan.address)
    
    await flashloan.transferOwnership(deployer.address)

    await flashloan.connect(deployer).setExecutor(arbitrage.address)
    await arbitrage.transferOwnership(deployer.address)
}
export default func
func.dependencies = ["Arbitrage.deploy", "FlashLoanTaker.deploy"]
func.tags = ["Setup.deploy"]
