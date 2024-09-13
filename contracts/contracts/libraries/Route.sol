// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Route {
  struct SinglePath {
    address router;
    address[] tokens;
  }

  string public constant INVALID_LEN = "Invalid len";
  string public constant ZERO_ADDRESS = "Zero address";
  string public constant INVALID_SINGLE_PATH = "Invalid path";
  string public constant INCONSISTENT_ROUTE = "Inconsistent route";
  string public constant NOT_CYCLE = "Not cycle";

  function encode(
    uint256 flashloanAmount,
    uint256 minAmountOut,
    SinglePath[] memory route
  ) internal pure returns (bytes memory res) {
    res = abi.encode(flashloanAmount, minAmountOut, route);
  }

  function decodeRouteData(
    bytes memory data
  ) internal pure returns (uint256 flashLoanAmount, uint256 minAmountOut, SinglePath[] memory route) {
    // ABI decode params
    (flashLoanAmount, minAmountOut, route) = abi.decode(data, (uint256, uint256, SinglePath[]));
  }

  function validateRoute(SinglePath[] memory route) internal pure {
    require(route.length != 0, INVALID_LEN);

    // do not check for max len and cycles in path (todo off-chain)
    // flashloan base
    _validateSinglePath(route[0], 0);

    for (uint256 i = 1; i < route.length; ++i) {
      _validateSinglePath(route[i], i);
      require(route[i].tokens[0] == _lastTokenInPath(route[i - 1]), INCONSISTENT_ROUTE);
    }

    // route must start and end with one token (this token is a profit maker)
    (address tokenFirst, address tokenLast) = getSideTokens(route);
    require(tokenFirst == tokenLast, NOT_CYCLE);
  }

  function _lastTokenInPath(SinglePath memory path) private pure returns(address) {
    uint256 len = path.tokens.length;
    return path.tokens[len - 1];
  }

  function _validateSinglePath(SinglePath memory path, uint256 pathId) private pure {
    if (pathId == 0)
     require(path.tokens.length == 2, INVALID_SINGLE_PATH);
    else 
    require(path.tokens.length >= 2, INVALID_SINGLE_PATH);

    require(path.router != address(0), ZERO_ADDRESS);

    for (uint256 j; j < path.tokens.length; ++j) {
      require(path.tokens[j] != address(0), ZERO_ADDRESS);
    }
  }

  function getSideTokens(
    SinglePath[] memory route
  ) internal pure returns (address tokenFlashloan, address tokenProfit) {
    uint256 routeLen = route.length;
    uint256 routeLastLen = route[routeLen - 1].tokens.length;

    return (route[0].tokens[0], route[routeLen - 1].tokens[routeLastLen - 1]);
  }

  function getFlashloanTokens(Route.SinglePath[] memory route) internal pure returns(address tokenProfit, address tokenLoan) {
    tokenProfit = route[0].tokens[0];
    tokenLoan = route[0].tokens[1];
  }
}
