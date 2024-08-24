// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import { ITestToken } from "./TestToken.sol";

interface ITestTrader {
  function mintTokens(address token, address to, uint256 amount) external;
  function execute(bytes calldata data) external;
}

contract TestTrader {
  uint256 public constant PROFIT_NUMERATOR = 1_00;
  uint256 public constant PROFIT_DENOMINATOR = 100_00;

  function execute(bytes calldata data) external {
    (address tokenSell, , uint256 targetAmount) = _decodeExecuteData(data);
    
    // testToken has openMint
    // send min target amount + 1% profit
    ITestToken(tokenSell).openMint(msg.sender, targetAmount * (PROFIT_NUMERATOR + PROFIT_DENOMINATOR) / PROFIT_DENOMINATOR);
  }

  function _decodeExecuteData(bytes memory data) private pure returns(address tokenSell, address tokenBuy, uint256 targetAmount) {
    (tokenSell, tokenBuy, targetAmount) = abi.decode(data, (address, address, uint256));
  }
}
