// SPDX-License-Identifier: MIT
pragma solidity =0.8.18;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Callee.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { ITrader } from "./Trader.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import { Route } from "./libraries/Route.sol";

interface IFlashLoanTaker {
  function executeFlashSwap(
    bytes calldata routeData
  ) external returns (uint256 profit);
}

contract FlashLoanTaker is
  IFlashLoanTaker,
  IUniswapV2Callee,
  Ownable,
  ReentrancyGuard
{
  using SafeERC20 for IERC20;

  // ------------ ERRORS ------------

  string public constant ADDRESS_ZERO = "Address zero";
  string public constant NO_PROFIT = "No profit";
  string public constant WRONG_CALLER = "Wrong caller";
  string public constant NOT_ALLOWED = "Not allowed";
  string public constant NOT_EXISTS = "Pair not exists";
  string public constant DUPLICATE = "Duplicate";
  string public constant NOT_CONTRACT = "Not contract";

  // trader contract
  address public trader;

  constructor(address _trader) {
    _setTrader(_trader);
    _transferOwnership(msg.sender);
  }

  function setTrader(address newTrader) external onlyOwner {
    _setTrader(newTrader);
  }

  function uniswapV2Call(
    address sender,
    uint,
    uint,
    bytes calldata data
  ) external override nonReentrant {
    (uint256 targetAmount, bytes memory routeData) = _decodeUniswapV2CallData(
      data
    );
    (uint256 amount, Route.SinglePath[] memory route) = Route.decodeRouteData(
      routeData
    );

    IUniswapV2Router02 uniV2Router = IUniswapV2Router02(route[0].router);

    (address tokenFirst, address tokenLast) = Route.getSideTokens(route);

    address pair = IUniswapV2Factory(uniV2Router.factory()).getPair(
      tokenFirst,
      tokenLast
    );

    // check that flash swap was called from this contract
    require(sender == address(this), NOT_ALLOWED);
    // check that real UniswapV2Pair calls the callback
    require(msg.sender == pair, WRONG_CALLER);

    /*
        contract has already received amount of tokenFlashLoan
        trader has to make profit and gain target amount of tokenProfit

        amountOut = amount
        target amount = getAmountIn(tokenFlashLoan)
    */

    // send all Flash Loan amount to trader for the future operations
    IERC20(tokenFirst).safeTransfer(trader, amount);

    // execute trading operations
    uint256 realAmountOut = ITrader(trader).execute(routeData);

    // expect we have sellTokensAfter - sellTokensBefore >= targetAmount
    // refill UniswapV2Pair contract to finish flash swap execution
    require(realAmountOut > targetAmount, NO_PROFIT);

    // fulfill pair flash swap
    IERC20(tokenLast).safeTransfer(pair, targetAmount);
  }

  function executeFlashSwap(
    bytes calldata routeData
  ) external onlyOwner returns (uint256 profit) {
    (uint256 amountFlashLoan, Route.SinglePath[] memory route) = Route
      .decodeRouteData(routeData);

    IUniswapV2Router02 uniV2Router = IUniswapV2Router02(route[0].router);

    (address tokenFirst, address tokenLast) = Route.getSideTokens(route);

    // execute swap with a funds gaining callback
    address pair = IUniswapV2Factory(uniV2Router.factory()).getPair(
      tokenFirst,
      tokenLast
    );

    require(pair != address(0), NOT_EXISTS);

    (
      uint256 targetAmount,
      uint256 amount0Out,
      uint256 amount1Out,
      ,

    ) = _calculateAmounts(amountFlashLoan, tokenFirst, pair, uniV2Router);

    // prepare calldata from uniV2 swap to execute callback
    bytes memory data = abi.encode(targetAmount, routeData);

    uint256 tokensBefore = IERC20(tokenLast).balanceOf(address(this));

    // performs a flash swap with gaining profit in uniswapV2Call => trader
    // flash swap reverts if profit - fees <= 0
    IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);

    // calculate flash trade profit
    profit = IERC20(tokenLast).balanceOf(address(this)) - tokensBefore;
  }

  function _decodeUniswapV2CallData(
    bytes memory data
  ) private pure returns (uint256 targetAmount, bytes memory routeBytes) {
    // ABI decode params
    (targetAmount, routeBytes) = abi.decode(data, (uint256, bytes));
  }

  function _calculateAmounts(
    uint256 amountFlashLoan,
    address tokenFirst,
    address pair,
    IUniswapV2Router02 uniV2Router
  )
    private
    view
    returns (
      uint256 targetAmount,
      uint256 amount0Out,
      uint256 amount1Out,
      uint256 reserveIn,
      uint256 reserveOut
    )
  {
    // get reserves to calculate the amountSell required for amount amount
    (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(pair).getReserves();

    if (IUniswapV2Pair(pair).token0() == tokenFirst) {
      amount0Out = amountFlashLoan;
      reserveIn = reserve1;
      reserveOut = reserve0;
    } else {
      amount1Out = amountFlashLoan;
      reserveIn = reserve0;
      reserveOut = reserve1;
    }

    // calculate the targetAmountIn required for swap
    targetAmount = uniV2Router.getAmountIn(
      amountFlashLoan,
      reserveIn,
      reserveOut
    );
  }

  function _setTrader(address newTrader) private {
    require(newTrader != trader, DUPLICATE);
    require(Address.isContract(newTrader), NOT_CONTRACT);

    trader = newTrader;
  }
}
