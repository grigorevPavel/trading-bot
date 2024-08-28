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

  function encode(
    uint256 flashloanAmount,
    SinglePath[] memory route
  ) internal pure returns (bytes memory res) {
    res = abi.encode(flashloanAmount, route);
  }

  function decodeRouteData(
    bytes memory data
  ) internal pure returns (uint256 flashLoanAmount, SinglePath[] memory route) {
    // ABI decode params
    (flashLoanAmount, route) = abi.decode(data, (uint256, SinglePath[]));
  }

  function validateRoute(SinglePath[] calldata route) internal pure {
    require(route.length >= 2, INVALID_LEN);

    // do not check for max len and cycles in path (todo off-chain)

    for (uint256 i; i < route.length; ++i) {
      require(route[i].tokens.length != 0, INVALID_SINGLE_PATH);
      require(route[i].router != address(0), ZERO_ADDRESS);

      for (uint256 j; j < route[i].tokens.length; ++j) {
        require(route[i].tokens[j] != address(0), ZERO_ADDRESS);
      }
    }
  }

  function getSideTokens(SinglePath[] memory route) internal pure returns(address tokenFlashloan, address tokenProfit) {
    uint256 routeLen = route.length;
    uint256 routeLastLen = route[routeLen - 1].tokens.length;

    return (route[0].tokens[0], route[routeLen - 1].tokens[routeLastLen - 1]);
  }
}
