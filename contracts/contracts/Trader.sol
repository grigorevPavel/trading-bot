// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

interface ITrader {
  event ExecutedTrade(
    address indexed tokenStart,
    address indexed tokenLast,
    uint256 amountIn,
    uint256 amountOut
  );
  function execute(bytes calldata routeData) external returns (uint256);
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
  string public constant AMOUNT_OUT_TOO_LOW = "Amount out too low";

  bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
  bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");
  uint256 public constant MIN_AMOUNT = 1_000; /// min swap amount

  constructor() {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  /// @dev No reentrancy possible, caller is the EXECUTOR_ROLE only (arbitrage contract)
  function execute(
    bytes calldata routeData
  ) external onlyRole(EXECUTOR_ROLE) returns (uint256 realAmountOut) {
    // walks through the route (token, router)[] and swaps assets
    // uses token[0] as start collateral, contract must be fulfilled before the trade
    (, uint256 amountOutMin, Route.SinglePath[] memory route) = Route
      .decodeRouteData(routeData);

    Route.validateRoute(route);

    (address tokenProfit, address tokenLoan) = Route.getFlashloanTokens(route);

    uint256 lastAmountOut;

    uint256 amountStartIn = IERC20(tokenLoan).balanceOf(address(this));

    require(amountStartIn >= MIN_AMOUNT, NOT_ENOUGH_START_COLLATERAL);

    // do not trade flashloan path (already done in flashloan contract)
    for (uint256 pathId = 1; pathId < route.length; ) {
      // swap through the current path
      // if pathId == 1, start with flashloan token (already received on contract)

      address router = route[pathId].router;
      uint256 amountIn = pathId == 1
        ? amountStartIn
        : IERC20(route[pathId].tokens[0]).balanceOf(address(this));

      lastAmountOut = _getAmountOut(amountIn, route[pathId].tokens, router);

      // swap through token path
      IERC20(route[pathId].tokens[0]).safeApprove(router, amountIn);
      IUniswapV2Router01(router).swapExactTokensForTokens(
        amountIn,
        0,
        route[pathId].tokens,
        address(this),
        block.timestamp + 1
      );

      unchecked {
        ++pathId;
      }
    }

    require(lastAmountOut >= amountOutMin, AMOUNT_OUT_TOO_LOW);

    realAmountOut = IERC20(tokenProfit).balanceOf(address(this));
    // fulfill trader caller
    IERC20(tokenProfit).safeTransfer(msg.sender, realAmountOut);

    emit ExecutedTrade(tokenLoan, tokenProfit, amountStartIn, realAmountOut);
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
