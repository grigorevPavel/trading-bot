import { FlashLoanTaker, UniswapV2Trader } from "@/typechain"
import { ethers } from "hardhat"
import type { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async (hre) => {
    const [deployer] = await ethers.getSigners()
    const {deployments} = hre
    const {deploy} = deployments

    const trader = await ethers.getContract<UniswapV2Trader>('UniswapV2Trader')

    await deploy("FlashLoanTaker", {
        from: deployer.address,
        args: [trader.address],
        log: true
    })
}
export default func
func.dependencies = ["Trader.deploy"]
func.tags = ["FlashLoanTaker.deploy"]
