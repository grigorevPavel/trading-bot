// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface ITestToken {
     function openMint(address to, uint256 amount) external;
}

contract TestToken is ITestToken,  ERC20 {
  constructor() ERC20("Test Token", "TST") {}

  function openMint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}
