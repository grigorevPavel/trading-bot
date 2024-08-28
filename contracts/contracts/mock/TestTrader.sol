// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import { ITestToken } from "./TestToken.sol";
import { ITrader } from "../Trader.sol";
import { IArbitrage } from "../Arbitrage.sol";

contract TestTrader is ITrader {
  uint256 public constant PROFIT_FIX = 1 ether / 100; // 0.01 ETH

  function execute(uint256 targetAmount, bytes calldata routeData) external {
    (, IArbitrage.Step[] memory route) = _decodeRouteData(routeData);
    address tokenIn = route[route.length - 1].token;

    // testToken has openMint
    // send min target amount + 1% profit
    ITestToken(tokenIn).openMint(msg.sender, targetAmount + PROFIT_FIX);
  }

  function _decodeRouteData(
    bytes memory data
  )
    private
    pure
    returns (uint256 flashLoanAmount, IArbitrage.Step[] memory route)
  {
    // ABI decode params
    (flashLoanAmount, route) = abi.decode(
      data,
      (uint256, IArbitrage.Step[])
    );
  }
}
