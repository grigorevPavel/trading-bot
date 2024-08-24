// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import { ITestToken } from "./TestToken.sol";

interface ITestTrader {
  function mintTokens(address token, address to, uint256 amount) external;
  function execute(bytes calldata data) external;
}

contract TestTrader {
  uint256 public constant PROFIT_FIX = 1 ether / 100; // 0.01 ETH

  function execute(bytes calldata data) external {
    (address tokenIn, , uint256 targetAmount) = _decodeExecuteData(data);

    // testToken has openMint
    // send min target amount + 1% profit
    ITestToken(tokenIn).openMint(msg.sender, targetAmount + PROFIT_FIX);
  }

  function _decodeExecuteData(
    bytes memory data
  )
    private
    pure
    returns (address tokenIn, address tokenOut, uint256 targetAmount)
  {
    (tokenIn, tokenOut, targetAmount) = abi.decode(
      data,
      (address, address, uint256)
    );
  }
}
