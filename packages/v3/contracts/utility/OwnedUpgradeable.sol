// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "./interfaces/IOwned.sol";

import "./Upgradeable.sol";

/**
 * @dev this contract provides support and utilities for contract ownership
 */
abstract contract OwnedUpgradeable is IOwned, Upgradeable {
    address private _owner;
    address private _newOwner;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when the owner is updated
     */
    event OwnerUpdate(address indexed prevOwner, address indexed newOwner);

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __Owned_init() internal initializer {
        __Owned_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __Owned_init_unchained() internal initializer {
        _setOwner(msg.sender);
    }

    // solhint-enable func-name-mixedcase

    // allows execution by the owner only
    modifier onlyOwner {
        _onlyOwner();

        _;
    }

    // error message binary size optimization
    function _onlyOwner() private view {
        require(msg.sender == _owner, "ERR_ACCESS_DENIED");
    }

    /**
     * @dev allows transferring the contract ownership
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     *
     * note the new owner still needs to accept the transfer
     */
    function transferOwnership(address ownerCandidate) public override onlyOwner {
        require(ownerCandidate != _owner, "ERR_SAME_OWNER");

        _newOwner = ownerCandidate;
    }

    /**
     * @dev used by a new owner to accept an ownership transfer
     */
    function acceptOwnership() public override {
        require(msg.sender == _newOwner, "ERR_ACCESS_DENIED");

        _setOwner(_newOwner);
    }

    /**
     * @dev returns the address of the current owner
     */
    function owner() public view override returns (address) {
        return _owner;
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
    function _setOwner(address ownerCandidate) private {
        emit OwnerUpdate(_owner, ownerCandidate);

        _owner = ownerCandidate;
        _newOwner = address(0);
    }
}
