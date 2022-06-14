// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { AccessDenied, Utils } from "./Utils.sol";

/**
 * @dev this contract is a slightly optimized version of the original TransparentUpgradeableProxy solely designed to
 * work with the ProxyAdmin contract:
 *
 * - the address of the admin is stored as an immutable state variables and as the result:
 * - the address of the admin can't be change, so the changeAdmin() function was subsequently removed
 *
 * note that we're using the Transparent Upgradeable Proxy pattern and *not* the Universal Upgradeable Proxy Standard
 * (UUPS) pattern, therefore initializing the implementation contracts is not necessary or required
 */
contract TransparentUpgradeableProxyImmutable is ERC1967Proxy, Utils {
    address internal immutable _admin;

    /**
     * @dev initializes an upgradeable proxy managed by `initAdmin`, backed by the implementation at `logic`, and
     * optionally initialized with `data` as explained in {ERC1967Proxy-constructor}
     */
    constructor(
        address logic,
        address initAdmin,
        bytes memory data
    ) payable ERC1967Proxy(logic, data) validAddress(initAdmin) {
        _admin = initAdmin;

        // still store it to work with EIP-1967
        _changeAdmin(initAdmin);
    }

    modifier ifAdmin() {
        if (msg.sender == _admin) {
            _;
        } else {
            _fallback();
        }
    }

    /**
     * @dev returns the current admin
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function admin() external ifAdmin returns (address) {
        return _admin;
    }

    /**
     * @dev returns the current implementation.
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function implementation() external ifAdmin returns (address) {
        return _implementation();
    }

    /**
     * @dev upgrades the implementation of the proxy
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function upgradeTo(address newImplementation) external ifAdmin {
        _upgradeToAndCall(newImplementation, bytes(""), false);
    }

    /**
     * @dev upgrade the implementation of the proxy, and then call a function from the new implementation as specified
     * by data, which should be an encoded function call. This is useful to initialize new storage variables in the
     * proxied contract
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable ifAdmin {
        _upgradeToAndCall(newImplementation, data, true);
    }

    /**
     * @dev makes sure the admin cannot access the fallback function
     */
    function _beforeFallback() internal virtual override {
        if (msg.sender == _admin) {
            revert AccessDenied();
        }

        super._beforeFallback();
    }
}
