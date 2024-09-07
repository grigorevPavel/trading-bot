// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol";

interface ITestToken {
  function openMint(address to, uint256 amount) external;
}

contract TestToken is ITestToken, ERC20 {
  constructor() ERC20("Test Token", "TST") {}

  function openMint(address to, uint256 amount) external {
    _mint(to, amount);
  }
}

import "@openzeppelin/contracts/access/Ownable.sol";

contract Reentrancy is Ownable {
  address public caller;
  bytes public callData;

  mapping(address => uint256) private _balanceOf;

  function setCall(address _caller, bytes memory _callData) external {
    caller = _caller;
    callData = _callData;
  }

  function balanceOf(address to) public returns (uint256) {
    _call();
    return _balanceOf[to];
  }

  function mint(address to, uint256 val) public {
    _balanceOf[to] += val;
  }

  function transfer(address to, uint256 val) public {
    _call();
    _balanceOf[msg.sender] -= val;
    _balanceOf[to] += val;
  }

  function transferFrom(address from, address to, uint256 val) public {
    _call();
    _balanceOf[from] -= val;
    _balanceOf[to] += val;
  }

  function approve(address, uint256) public returns (bool) {
    return true;
  }

  function execute(bytes calldata routeData) external {
    IUniswapV2Callee(msg.sender).uniswapV2Call(address(this), 0, 0, routeData);
  }

  function test(uint256 num) external pure returns (uint256) {
    return num + 1;
  }

  function _call() private {
    if (caller == address(0)) return;

    (bool success, bytes memory data) = caller.call(callData);
    if (!success) {
      if (data.length < 68) revert();
      assembly {
        data := add(data, 0x04)
      }
      revert(abi.decode(data, (string)));
    }
  }
}
