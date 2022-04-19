// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { ITokenGovernance, IMintableToken } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { AccessControlEnumerable } from "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

import { AccessDenied } from "../utility/Utils.sol";

contract TestTokenGovernance is ITokenGovernance, AccessControlEnumerable {
    bytes32 public constant ROLE_SUPERVISOR = keccak256("ROLE_SUPERVISOR");
    bytes32 public constant ROLE_GOVERNOR = keccak256("ROLE_GOVERNOR");
    bytes32 public constant ROLE_MINTER = keccak256("ROLE_MINTER");

    IMintableToken private immutable _token;

    constructor(IMintableToken mintableToken) {
        _token = mintableToken;

        _setRoleAdmin(ROLE_SUPERVISOR, ROLE_SUPERVISOR);
        _setRoleAdmin(ROLE_GOVERNOR, ROLE_SUPERVISOR);
        _setRoleAdmin(ROLE_MINTER, ROLE_GOVERNOR);

        _setupRole(ROLE_SUPERVISOR, _msgSender());
    }

    function token() external view returns (IMintableToken) {
        return _token;
    }

    function acceptTokenOwnership() external {
        if (!hasRole(ROLE_SUPERVISOR, _msgSender())) {
            revert AccessDenied();
        }

        _token.acceptOwnership();
    }

    function mint(address to, uint256 amount) external override {
        if (!hasRole(ROLE_MINTER, _msgSender())) {
            revert AccessDenied();
        }

        _token.issue(to, amount);
    }

    function burn(uint256 amount) external override {
        _token.destroy(_msgSender(), amount);
    }
}
