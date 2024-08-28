// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

interface ITrader {
  function execute(uint256 targetAmount, bytes calldata routeData) external;
}

import '@openzeppelin/contracts/access/AccessControlEnumerable.sol';

contract Trader is AccessControlEnumerable {
  bytes32 public constant EXECUTOR_ROLE = keccak256('EXECUTOR_ROLE');

  function execute(uint256 targetAmount, bytes calldata routeData) external onlyRole(EXECUTOR_ROLE) {
    
  }
}
