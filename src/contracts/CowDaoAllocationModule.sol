// SPDX-License-Identifier: LGPL-3.0-or-later
pragma solidity ^0.8;

import {AllocationModule} from "./AllocationModule.sol";

/// @dev A Safe module used to distribute COW token allocation from COW DAO.
/// @title COW DAO Allocation Module
/// @author CoW Protocol Developers
contract CowDaoAllocationModule is AllocationModule {
    constructor(address _controller, address _vcow)
        AllocationModule(_controller, _vcow)
    {} // solhint-disable-line no-empty-blocks
}
