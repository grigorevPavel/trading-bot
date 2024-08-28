// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IFlashLoanTaker } from "./FlashloanTaker.sol";

interface IArbitrage {
  struct Step {
    address token;
    address router;
  }
}

contract Arbitrage is IArbitrage, OwnableUpgradeable {
  using SafeERC20Upgradeable for IERC20Upgradeable;

  string public constant PATH_LENGTH_INVALID = "Path length invalid";
  string public constant ZERO_ADDRESS = "Zero address";
  string public constant INVALID_STEP = "Invalid step";

  /*
    Arbitrage path may go through multiple based dexes

    path: 
    0) token0, dex0 (FlashSwap base token)
    1) token1, dex1
    2) token2, dex2
    ...
    N) tokenN, dexN

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
    Step[] calldata route,
    uint256 flashloanAmount
  ) external onlyOwner {
    _validateRoute(route);

    IFlashLoanTaker(flashloan).executeFlashSwap(
      _encode(flashloanAmount, route)
    );
  }

  function _validateRoute(Step[] calldata route) private pure {
    require(route.length >= 2, PATH_LENGTH_INVALID);

    for (uint256 i; i < route.length; ++i) {
      require(route[i].token != address(0), ZERO_ADDRESS);
      if (i != 0) require(route[i].router != address(0), ZERO_ADDRESS);
      require(route[i].router != route[i].token, INVALID_STEP);
    }
  }

  function _encode(
    uint256 flashloanAmount,
    Step[] memory route
  ) private pure returns (bytes memory res) {
    res = abi.encode(flashloanAmount, route);
  }
}
