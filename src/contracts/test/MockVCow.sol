// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8;

/// @dev Mock of vCOW token. Emits an event when calling `swap`.
/// @title vCOW mock contract
/// @author CoW Protocol Developers
contract MockVcow {
    address public cowToken;

    constructor(address _cowToken) {
        cowToken = _cowToken;
    }

    event Swapped(address caller, uint256 amount);

    function swap(uint256 amount) external {
        emit Swapped(msg.sender, amount);
    }
}
