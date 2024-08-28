// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import { ITestToken } from "./TestToken.sol";
import { ITrader } from "../Trader.sol";
import { Route } from "../libraries/Route.sol";

contract TestTrader is ITrader {
  uint256 public constant PROFIT_FIX = 1 ether / 100; // 0.01 ETH

  function execute(uint256 targetAmount, bytes calldata routeData) external {
    (, Route.SinglePath[] memory route) = Route.decodeRouteData(routeData);
    (, address tokenLast) = Route.getSideTokens(route);

    // testToken has openMint
    // send min target amount + 1% profit
    ITestToken(tokenLast).openMint(msg.sender, targetAmount + PROFIT_FIX);
  }
}
