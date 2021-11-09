// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { PoolCollectionWithdrawal } from "../pools/PoolCollectionWithdrawal.sol";

contract TestPoolCollectionWithdrawal {
    function formulaT(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 e,
        uint256 w,
        uint256 m,
        uint256 n,
        uint256 x
    ) external pure returns (PoolCollectionWithdrawal.Output memory) {
        return PoolCollectionWithdrawal.formula(a,b,c,e,w,m,n,x);
    }
}
