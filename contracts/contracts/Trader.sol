// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

interface ITrader {
  function execute(bytes calldata data) external;
}

contract Trader {
  function execute(bytes calldata data) external {}
}
