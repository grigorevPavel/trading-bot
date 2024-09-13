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
    bool exactDebt,
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
  string public constant NOT_EXECUTOR = "Not executor";

  // ------------- EVENTS --------------

  event SetTrader(address indexed newTrader);
  event SetExecutor(address indexed newExecutor);
  event ExecutedFlashSwap(
    address indexed tokenProfit,
    address indexed tokenLoan,
    uint256 amountFlashLoan,
    uint256 profit
  );

  // trader contract
  address public trader;
  // executor account (arbitrage contract), may be set in post init
  address public executor;

  constructor(address _trader) {
    _setTrader(_trader);
    _transferOwnership(msg.sender);
  }

  function setExecutor(address newExecutor) external onlyOwner {
    require(newExecutor != address(0), ADDRESS_ZERO);
    require(newExecutor != executor, DUPLICATE);

    executor = newExecutor;
    emit SetExecutor(newExecutor);
  }

  function setTrader(address newTrader) external onlyOwner {
    _setTrader(newTrader);
    emit SetTrader(newTrader);
  }

  function uniswapV2Call(
    address sender,
    uint,
    uint,
    bytes calldata data
  ) external override nonReentrant {
    (
      uint256 targetAmount,
      uint256 amountIn,
      bytes memory routeData
    ) = _decodeUniswapV2CallData(data);
    (, , Route.SinglePath[] memory route) = Route.decodeRouteData(routeData);

    IUniswapV2Router02 uniV2Router = IUniswapV2Router02(route[0].router);

    (address tokenProfit, address tokenLoan) = Route.getFlashloanTokens(route);

    address pair = IUniswapV2Factory(uniV2Router.factory()).getPair(
      tokenProfit,
      tokenLoan
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
    IERC20(tokenLoan).safeTransfer(trader, amountIn);

    // execute trading operations
    uint256 realAmountOut = ITrader(trader).execute(routeData);

    // expect we have sellTokensAfter - sellTokensBefore >= targetAmount
    // refill UniswapV2Pair contract to finish flash swap execution
    require(realAmountOut > targetAmount, NO_PROFIT);

    // fulfill pair flash swap
    IERC20(tokenProfit).safeTransfer(pair, targetAmount);
  }

  function executeFlashSwap(
    bool exactDebt,
    bytes calldata routeData
  ) external returns (uint256 profit) {
    require(msg.sender == executor, NOT_EXECUTOR);

    (uint256 amountFlashLoan, , Route.SinglePath[] memory route) = Route
      .decodeRouteData(routeData);

    // flashloan router
    IUniswapV2Router02 uniV2Router = IUniswapV2Router02(route[0].router);

    (address tokenProfit, address tokenLoan) = Route.getFlashloanTokens(route);

    // execute swap with a funds gaining callback
    address pair = IUniswapV2Factory(uniV2Router.factory()).getPair(
      tokenProfit,
      tokenLoan
    );

    require(pair != address(0), NOT_EXISTS);

    uint256 targetAmount;
    uint256 amount0Out;
    uint256 amount1Out;
    bytes memory data;

    if (!exactDebt) {
      // exact Loan => exact out amount from flashswap
      (targetAmount, amount0Out, amount1Out, , ) = _calculateAmountsExactLoan(
        amountFlashLoan,
        tokenLoan,
        pair,
        uniV2Router
      );
      // prepare calldata from uniV2 swap to execute callback
      data = abi.encode(targetAmount, amountFlashLoan, routeData);
    } else {
      // exact Debt => exact in amount into flashswap
      (targetAmount, amount0Out, amount1Out, , ) = _calculateAmountsExactDebt(
        amountFlashLoan,
        tokenLoan,
        pair,
        uniV2Router
      );

      // prepare calldata from uniV2 swap to execute callback
      data = abi.encode(targetAmount, amount0Out + amount1Out, routeData);
    }

    uint256 tokensBefore = IERC20(tokenProfit).balanceOf(address(this));

    // performs a flash swap with gaining profit in uniswapV2Call => trader
    // flash swap reverts if profit - fees <= 0
    IUniswapV2Pair(pair).swap(amount0Out, amount1Out, address(this), data);

    // calculate flash trade profit
    profit = IERC20(tokenProfit).balanceOf(address(this)) - tokensBefore;

    // send profit to caller (arbitrage contract)
    IERC20(tokenProfit).safeTransfer(msg.sender, profit);

    emit ExecutedFlashSwap(tokenProfit, tokenLoan, amountFlashLoan, profit);
  }

  function _decodeUniswapV2CallData(
    bytes memory data
  )
    private
    pure
    returns (uint256 targetAmount, uint256 amountIn, bytes memory routeBytes)
  {
    // ABI decode params
    (targetAmount, amountIn, routeBytes) = abi.decode(
      data,
      (uint256, uint256, bytes)
    );
  }

  function _calculateAmountsExactLoan(
    uint256 amountFlashLoan,
    address tokenLoan,
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

    if (IUniswapV2Pair(pair).token0() == tokenLoan) {
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

  function _calculateAmountsExactDebt(
    uint256 amountFlashLoan,
    address tokenLoan,
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

    address token0 = IUniswapV2Pair(pair).token0();
    if (token0 == tokenLoan) {
      reserveIn = reserve1;
      reserveOut = reserve0;
    } else {
      reserveIn = reserve0;
      reserveOut = reserve1;
    }

    // calculate the targetAmountOut required for swap
    uint256 amountOut = uniV2Router.getAmountOut(
      amountFlashLoan,
      reserveIn,
      reserveOut
    );

    if (token0 == tokenLoan) {
      amount0Out = amountOut;
      // amount1Out = 0 (token 1 goes in)
    } else {
      amount1Out = amountOut;
      // amount0Out = 0 (token 0 goes in)
    }

    // trader has to return only amountIn
    targetAmount = amountFlashLoan;
  }

  function _setTrader(address newTrader) private {
    require(newTrader != trader, DUPLICATE);
    require(Address.isContract(newTrader), NOT_CONTRACT);

    trader = newTrader;
  }
}
