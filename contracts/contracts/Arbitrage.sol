// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFlashLoanTaker } from "./FlashloanTaker.sol";
import { Route } from "./libraries/Route.sol";

contract Arbitrage is OwnableUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  string public constant ADDRESS_ZERO = "Address zero";
  string public constant NOTHING_TO_CLAIM = "Nothing to claim";
  string public constant DUPLICATE = "Duplicate";

  event Init(address indexed flashloan);
  event FlashloanSet(address indexed flashloan);
  event ClaimedProfit(
    address indexed token,
    address indexed receiver,
    uint256 amount
  );
  event ArbitrageMade(
    uint256 indexed flashloanAmount,
    uint256 indexed amountOutMin,
    Route.SinglePath[] route
  );

  /*
    Arbitrage path may go through multiple based dexes

    path: 
    0) [token0_0, token0_1], dex0 (FlashSwap base token == token0_0, loan token == token0_1)
    1) [token1_0, token1_1, ... , token1_m], dex1
    2) [token2_0, token2_1, ... , token2_k], dex2
    ...
    N) [tokenN_0, tokenN_1, ... , tokenN_l], dexN

    Flash Swap: tokenN_l in (profit) == token0_0, token0_n out (loan)
  */

  address public flashloan;

  constructor() {
    _disableInitializers();
  }

  function init(address _flashloan) external initializer {
    require(_flashloan != address(0), ADDRESS_ZERO);
    flashloan = _flashloan;
    _transferOwnership(msg.sender);
    emit Init(_flashloan);
  }

  function resetFlashloan(address _flashloan) external onlyOwner {
    require(_flashloan != address(0), ADDRESS_ZERO);
    require(_flashloan != flashloan, DUPLICATE);
    flashloan = _flashloan;
    emit FlashloanSet(_flashloan);
  }

  function makeArbitrage(
    bool exactDebt,
    uint256 flashloanAmount,
    uint256 amountOutMin,
    Route.SinglePath[] calldata route
  ) external onlyOwner {
    Route.validateRoute(route);

    IFlashLoanTaker(flashloan).executeFlashSwap(
      exactDebt,
      Route.encode(flashloanAmount, amountOutMin, route)
    );

    emit ArbitrageMade(flashloanAmount, amountOutMin, route);
  }

  function claimProfit(address token) external onlyOwner {
    require(token != address(0), ADDRESS_ZERO);

    uint256 balance = IERC20Upgradeable(token).balanceOf(address(this));

    emit ClaimedProfit(token, msg.sender, balance);
    IERC20Upgradeable(token).safeTransfer(msg.sender, balance);
  }
}
