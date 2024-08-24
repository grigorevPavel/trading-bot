// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import { ITrader } from "./Trader.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FlashloanTaker is IUniswapV2Callee, Ownable {
  using SafeERC20 for IERC20;

  // ------------ ERRORS ------------

  string public constant ADDRESS_ZERO = "Address zero";
  string public constant NO_PROFIT = "No profit";
  string public constant WRONG_CALLER = "Wrong caller";
  string public constant NOT_ALLOWED = "Not allowed";

  // uniswap V2 router contract
  address public uniV2Router;
  // uniswap V2 factory
  address public uniV2factory;
  // trader contract
  address public trader;

  constructor(address _router, address _trader) {
    require(_router != address(0), ADDRESS_ZERO);
    require(_trader != address(0), ADDRESS_ZERO);

    uniV2Router = _router;
    uniV2factory = IUniswapV2Router01(_router).factory();
    trader = _trader;
    _transferOwnership(msg.sender);
  }

  function uniswapV2Call(
    address sender,
    uint amount0,
    uint amount1,
    bytes calldata data
  ) external override {
    (
      address token0,
      address token1,
      uint256 targetAmount
    ) = _decodeUniswapV2CallData(data);

    address pair = IUniswapV2Factory(uniV2factory)
      .getPair(token0, token1);

    // check that real UniswapV2Pair calls the callback
    require(msg.sender == pair, WRONG_CALLER);
    // assuming that caller == real pair, check that flash swap was called from this contract
    require(sender == address(this), NOT_ALLOWED);

    /*
        contract has already received amount of tokenOut
        trader has to make profit and gain target amount of tokenIn

        amountOut = amount
        target amount = getAmountIn(tokenOut)
    */

    // only one of amounts out != 0
    uint256 amount = amount0 > 0 ? amount0 : amount1;

    (address tokenOut, address tokenIn) = amount0 == 0
      ? (token1, token0)
      : (token0, token1);

    // send all Flash Loan amount to trader for the future operations
    IERC20(tokenOut).safeTransfer(trader, amount);

    // prepare calldata for trader
    bytes memory traderCallData = abi.encode(tokenIn, tokenOut, targetAmount);

    uint256 outTokensBefore = IERC20(tokenIn).balanceOf(address(this));
    // execute trading operations
    ITrader(trader).execute(traderCallData);
    uint256 outTokensAfter = IERC20(tokenIn).balanceOf(address(this));

    // expect we have sellTokensAfter - sellTokensBefore >= targetAmount
    // refill UniswapV2Pair contract to finish flash swap execution
    require(outTokensAfter > outTokensBefore + targetAmount, NO_PROFIT);

    // fulfill pair flash swap
    IERC20(tokenIn).safeTransfer(pair, targetAmount);
  }

  function executeFlashSwap(
    address tokenOut,
    address tokenIn,
    uint256 amount
  ) external payable onlyOwner returns (uint256 profit) {
    // execute swap with a funds gaining callback
    address pair = IUniswapV2Factory(uniV2factory)
      .getPair(tokenOut, tokenIn);
    address token0 = IUniswapV2Pair(pair).token0();
    address token1 = IUniswapV2Pair(pair).token1();
    require(pair != address(0), "Pair not exists");

    uint256 amount0Out;
    uint256 amount1Out;
    uint256 reserveIn;
    uint256 reserveOut;

    // get reserves to calculate the amountSell required for amount amount
    (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pair).getReserves();

    if (token0 == tokenOut) {
      amount0Out = amount;
      reserveIn = reserve1;
      reserveOut = reserve0;
    } else {
      amount1Out = amount;
      reserveIn = reserve0;
      reserveOut = reserve1;
    }

    // calculate the amountSell required for amount amount
    uint256 amountSell = IUniswapV2Router02(uniV2Router).getAmountIn(
      amount,
      reserveIn,
      reserveOut
    );

    // prepare calldata from uniV2 swap to execute callback
    bytes memory data = abi.encode(token0, token1, amountSell, pair);

    uint256 tokensBefore = IERC20(tokenIn).balanceOf(address(this));

    // performs a flash swap with gaining profit in uniswapV2Call => trader
    // flash swap reverts if profit - fees == 0
    IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);

    // calculate flash trade profit
    profit = IERC20(tokenIn).balanceOf(address(this)) - tokensBefore;
  }

  function _decodeUniswapV2CallData(
    bytes memory data
  )
    private
    pure
    returns (address token0, address token1, uint256 targetAmount)
  {
    // ABI decode params
    (token0, token1, targetAmount) = abi.decode(
      data,
      (address, address, uint256)
    );
  }
}
