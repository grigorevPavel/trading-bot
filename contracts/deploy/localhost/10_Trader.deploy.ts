import { UniswapV2Trader, UniswapV2Trader__factory } from "@/typechain"
import { ethers } from "hardhat"
import type { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async (hre) => {
    const [deployer] = await ethers.getSigners()
    const {deployments} = hre
    const {deploy} = deployments
    await deploy("UniswapV2Trader", {
        from: deployer.address,
        args: [],
        log: true
    })
}
export default func
func.tags = ["Trader.deploy"]
