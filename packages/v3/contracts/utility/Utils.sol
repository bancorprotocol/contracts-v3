// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { PPM_RESOLUTION } from "./Constants.sol";

error AccessControl();
error AlreadyExists();
error DoesNotExist();
error InvalidAddress();
error InvalidExternalAddress();
error InvalidFee();
error InvalidPool();
error InvalidPoolBalance();
error InvalidPoolCollection();
error InvalidPortion();
error InvalidStakedBalance();
error InvalidToken();
error InvalidType();
error NotEmpty();
error NotWhitelisted();
error ZeroValue();

/**
 * @dev common utilities
 */
contract Utils {
    // allows execution by the sender only
    modifier only(address sender) {
        _only(sender);

        _;
    }

    function _only(address sender) internal view {
        if (msg.sender != sender) {
            revert AccessControl();
        }
    }

    // verifies that a value is greater than zero
    modifier greaterThanZero(uint256 value) {
        _greaterThanZero(value);

        _;
    }

    // error message binary size optimization
    function _greaterThanZero(uint256 value) internal pure {
        if (value == 0) {
            revert ZeroValue();
        }
    }

    // validates an address - currently only checks that it isn't null
    modifier validAddress(address addr) {
        _validAddress(addr);

        _;
    }

    // error message binary size optimization
    function _validAddress(address addr) internal pure {
        if (addr == address(0)) {
            revert InvalidAddress();
        }
    }

    // ensures that the portion is valid
    modifier validPortion(uint32 _portion) {
        _validPortion(_portion);

        _;
    }

    // error message binary size optimization
    function _validPortion(uint32 _portion) internal pure {
        if (_portion == 0 || _portion > PPM_RESOLUTION) {
            revert InvalidPortion();
        }
    }

    // validates an external address - currently only checks that it isn't null or this
    modifier validExternalAddress(address addr) {
        _validExternalAddress(addr);

        _;
    }

    // error message binary size optimization
    function _validExternalAddress(address addr) internal view {
        if (addr == address(0) || addr == address(this)) {
            revert InvalidExternalAddress();
        }
    }

    // ensures that the fee is valid
    modifier validFee(uint32 fee) {
        _validFee(fee);

        _;
    }

    // error message binary size optimization
    function _validFee(uint32 fee) internal pure {
        if (fee > PPM_RESOLUTION) {
            revert InvalidFee();
        }
    }
}
