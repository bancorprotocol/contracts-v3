// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IOwned } from "./interfaces/IOwned.sol";
import { AccessDenied } from "./Utils.sol";

/**
 * @dev this contract provides support and utilities for contract ownership
 */
abstract contract Owned is IOwned {
    error SameOwner();

    address private _owner;
    address private _newOwner;

    /**
     * @dev triggered when the owner is updated
     */
    event OwnerUpdate(address indexed prevOwner, address indexed newOwner);

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract
     */
    constructor() {
        _setOwnership(msg.sender);
    }

    // solhint-enable func-name-mixedcase

    // allows execution by the owner only
    modifier onlyOwner() {
        _onlyOwner();

        _;
    }

    // error message binary size optimization
    function _onlyOwner() private view {
        if (msg.sender != _owner) {
            revert AccessDenied();
        }
    }

    /**
     * @inheritdoc IOwned
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @inheritdoc IOwned
     */
    function transferOwnership(address ownerCandidate) public virtual onlyOwner {
        if (ownerCandidate == _owner) {
            revert SameOwner();
        }

        _newOwner = ownerCandidate;
    }

    /**
     * @inheritdoc IOwned
     */
    function acceptOwnership() public virtual {
        if (msg.sender != _newOwner) {
            revert AccessDenied();
        }

        _setOwnership(_newOwner);
    }

    /**
     * @dev returns the address of the new owner candidate
     */
    function newOwner() external view returns (address) {
        return _newOwner;
    }

    /**
     * @dev sets the new owner internally
     */
    function _setOwnership(address ownerCandidate) private {
        address prevOwner = _owner;

        _owner = ownerCandidate;
        _newOwner = address(0);

        emit OwnerUpdate({ prevOwner: prevOwner, newOwner: ownerCandidate });
    }
}
