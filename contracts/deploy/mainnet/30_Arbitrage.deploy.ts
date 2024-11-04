import { Arbitrage, FlashLoanTaker } from "@/typechain"
import { ethers } from "hardhat"
import type { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async (hre) => {
    const [deployer] = await ethers.getSigners()
    const {deployments} = hre
    const {deploy} = deployments

    const flashLoanTaker = await ethers.getContract<FlashLoanTaker>('FlashLoanTaker')

    await deploy("Arbitrage", {
        from: deployer.address,
        args: [],
        log: true,
        proxy: {
            owner: deployer.address,
            proxyContract: 'OpenZeppelinTransparentProxy',
            execute: {
              methodName: 'init',
              args: [
                flashLoanTaker.address
              ],
            },
          },
    })
}
export default func
func.dependencies = ["FlashLoanTaker.deploy"]
func.tags = ["Arbitrage.deploy"]
