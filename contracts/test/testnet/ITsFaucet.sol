// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface ITsFaucet {
    event TsERC20Created(address indexed tokenAddr);

    event BatchMint(address indexed to);

    event BatchFreeMint(address indexed to);

    event DevMint(address indexed to, address indexed tokenAddr, uint256 amount);

    event SetFreeMint(bool indexed isFreeMint);

    event ExchangeMint(address indexed to, address indexed tokenAddr, uint256 amount);

    function zkTrueUp() external view returns (address);

    function exchange() external view returns (address);

    function setZkTrueUp(address _zkTrueUpAddr) external;

    function setExchange(address _exchangeAddr) external;
}
