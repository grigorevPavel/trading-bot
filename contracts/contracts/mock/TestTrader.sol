// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import { ITestToken } from "./TestToken.sol";
import { ITrader } from "../Trader.sol";
import { Route } from "../libraries/Route.sol";

contract TestTrader is ITrader {
  uint256 public constant PROFIT_FIX = 1 ether / 100; // 0.01 ETH

  uint256 public targetAmountIn;

  function setTargetAmount(uint256 amountIn) external {
    targetAmountIn = amountIn;
  }

  function execute(bytes calldata routeData) external returns(uint256) {
    (, Route.SinglePath[] memory route) = Route.decodeRouteData(routeData);
    (, address tokenLast) = Route.getSideTokens(route);

    // testToken has openMint
    // send min target amount + 1% profit
    ITestToken(tokenLast).openMint(msg.sender, targetAmountIn + PROFIT_FIX);
    return targetAmountIn + PROFIT_FIX;
  }
}
