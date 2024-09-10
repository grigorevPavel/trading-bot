// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFlashLoanTaker } from "./FlashloanTaker.sol";
import { Route } from "./libraries/Route.sol";

contract Arbitrage is OwnableUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  /*
    Arbitrage path may go through multiple based dexes

    path: 
    0) [token0_0, token0_1, ... , token0_n], dex0 (FlashSwap base token == token0_0)
    1) [token1_0, token1_1, ... , token1_m], dex1
    2) [token2_0, token2_1, ... , token2_k], dex2
    ...
    N) [tokenN_0, tokenN_1, ... , tokenN_l], dexN

    Flash Swap: tokenN in (profit), token0 out (loan)
  */

  address public flashloan;

  constructor() {
    _disableInitializers();
  }

  function init(address _flashloan) external initializer {
    flashloan = _flashloan;
    _transferOwnership(msg.sender);
  }

  function resetFlashloan(address _flashloan) external onlyOwner {
    flashloan = _flashloan;
  }

  function makeArbitrage(
    uint256 flashloanAmount,
    uint256 amountOutMin,
    Route.SinglePath[] calldata route
  ) external onlyOwner {
    Route.validateRoute(route);

    IFlashLoanTaker(flashloan).executeFlashSwap(
      Route.encode(flashloanAmount, amountOutMin, route)
    );
  }
}
