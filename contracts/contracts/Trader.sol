// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

interface ITrader {
  function execute(bytes calldata routeData) external;
}

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { Route } from "./libraries/Route.sol";

contract UniswapV2Trader is ITrader, AccessControlEnumerable {
  using SafeERC20 for IERC20;

  string public constant NOT_ENOUGH_START_COLLATERAL = "Not enough collateral";
  string public constant ZERO_SLIPPAGE = "Zero slippage";
  string public constant SLIPPAGE_TOO_HIGH = "Slippage too high";
  string public constant DUPLICATE = "Duplicate";
  string public constant TARGET_AMOUNT_NOT_REACHED =
    "target amount not reached";

  bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
  bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

  uint256 public constant ONE_HUNDRED = 100_00;
  uint256 public constant MAX_SLIPPAGE = 10_00;

  uint256 public slippageNumerator;

  function setSlippage(
    uint256 _slippageNumerator
  ) external onlyRole(MANAGER_ROLE) {
    require(_slippageNumerator != 0, ZERO_SLIPPAGE);
    require(_slippageNumerator <= MAX_SLIPPAGE, SLIPPAGE_TOO_HIGH);

    slippageNumerator = _slippageNumerator;
  }

  function execute(
    bytes calldata routeData
  ) external onlyRole(EXECUTOR_ROLE) {
    // walks through the route (token, router)[] and swaps assets
    // uses token[0] as start collateral, contract must be fulfilled before the trade
    (uint256 flashLoanAmount, Route.SinglePath[] memory route) = Route
      .decodeRouteData(routeData);

    (address tokenStart, address tokenEnd) = Route.getSideTokens(route);
    require(
      IERC20(tokenStart).balanceOf(address(this)) >= flashLoanAmount,
      NOT_ENOUGH_START_COLLATERAL
    );

    for (uint256 pathId; pathId < route.length; ) {
      // swap through the current path
      // if pathId == 0, start with flashloan token (already received on contract)

      address router = route[pathId].router;
      uint256 amountIn = IERC20(route[pathId].tokens[0]).balanceOf(
        address(this)
      );
      uint256 desiredAmountOut = _getAmountOut(
        amountIn,
        route[pathId].tokens,
        router
      );

      // swap through token path
      IUniswapV2Router01(router).swapExactTokensForTokens(
        amountIn,
        (desiredAmountOut * (ONE_HUNDRED - slippageNumerator)) / ONE_HUNDRED,
        route[pathId].tokens,
        address(this),
        block.timestamp + 1
      );

      unchecked {
        ++pathId;
      }
    }

    uint256 tokenEndBalance = IERC20(tokenEnd).balanceOf(address(this));
    // fulfill trader caller
    IERC20(tokenEnd).safeTransfer(msg.sender, tokenEndBalance);
  }

  function _getAmountOut(
    uint256 amountIn,
    address[] memory singlePath,
    address router
  ) private view returns (uint256) {
    uint256[] memory amounts = IUniswapV2Router01(router).getAmountsOut(
      amountIn,
      singlePath
    );

    // return the last token`s in chain amountOut
    return amounts[amounts.length - 1];
  }
}
