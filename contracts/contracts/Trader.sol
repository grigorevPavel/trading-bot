// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

interface ITrader {
  function execute(uint256 targetAmount, bytes calldata routeData) external;
}

import '@openzeppelin/contracts/access/AccessControlEnumerable.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol';
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract UniswapV2Trader is ITrader, AccessControlEnumerable {
  using SafeERC20 for IERC20;

  string public constant NOT_ENOUGH_START_COLLATERAL = 'Not enough collateral';
  string public constant ZERO_SLIPPAGE = 'Zero slippage';
  string public constant SLIPPAGE_TOO_HIGH = 'Slippage too high';
  string public constant DUPLICATE = 'Duplicate';

  bytes32 public constant EXECUTOR_ROLE = keccak256('EXECUTOR_ROLE');
  bytes32 public constant MANAGER_ROLE = keccak256('MANAGER_ROLE');

  uint256 public constant ONE_HUNDRED = 100_00;
  uint256 public constant MAX_SLIPPAGE = 10_00;

  uint256 public slippageNumerator;

  function setSlippage(uint256 _slippageNumerator) external onlyRole(MANAGER_ROLE) {
    require(_slippageNumerator != 0, ZERO_SLIPPAGE);
    require(_slippageNumerator <= MAX_SLIPPAGE, SLIPPAGE_TOO_HIGH);

    slippageNumerator = _slippageNumerator;
  }

  function execute(uint256 targetAmount, bytes calldata routeData) external onlyRole(EXECUTOR_ROLE) {
    // walks through the route (token, router)[] and swaps assets
    // uses token[0] as start collateral, contract must be fulfilled before the trade
    (uint256 flashLoanAmount, IArbitrage.Step[] memory route) = _decodeRouteData(routeData);
    require(IERC20(route[0].token).balanceOf(address(this)) >= flashLoanAmount, NOT_ENOUGH_START_COLLATERAL);

    // for (uint256 i = 1; i < route.length;) {
    //   address tokenIn = route[i - 1].token;
    //   address tokenOut = route[i].token;
    //   address router = route[i].router;

    //   uint256 amountIn = IERC20(tokenIn).balanceOf(address(this));

    //   uint256 desiredAmountOut = _getAmountOut(amountIn, tokenIn, tokenOut);
    //   IUniswapV2Router01(router).swapExactTokensForTokens(amountIn, desiredAmountOut * slippageNumerator / ONE_HUNDRED, )

    //   unchecked {
    //     ++i;
    //   }
    // }

    for (uint256 pathId; pathId < route.length;) {
      // swap through the current path
      // if pathId == 0, start with flashloan token (already received on contract)

      
      unchecked {
        ++pathId;
      }
    }
  }

  function _getAmountOut(uint256 amountIn, address tokenIn, address tokenOut, address router) private view returns(uint256) {
    address pair = IUniswapV2Factory(IUniswapV2Router01(router).factory()).getPair(tokenIn, tokenOut);

    (uint112 reserve0, uint112 reserve1,) = IUniswapV2Pair(pair).getReserves();

    if (tokenIn == IUniswapV2Pair(pair).token0()) 
      return IUniswapV2Router01(router).getAmountOut(amountIn, reserve0, reserve1);
    else
      return IUniswapV2Router01(router).getAmountOut(amountIn, reserve1, reserve0);
  }

  function _getAmountOut(uint256 amountIn, address[] memory singlePath, address router) private view returns(uint256) {
    address[] memory amounts = IUniswapV2Router01(router).getAmountsOut(uint256 amountIn, address[] memory singlePath);

    // return the last token`s in chain amountOut
    return amounts[amounts.length - 1];
  }
}
