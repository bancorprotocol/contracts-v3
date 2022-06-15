// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { Time } from "../utility/Time.sol";

import { ProgramData } from "../rewards/interfaces/IStandardRewards.sol";
import { StandardRewards } from "../rewards/StandardRewards.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";

import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { Token } from "../token/Token.sol";

import { TestTime } from "./TestTime.sol";

contract TestStandardRewards is StandardRewards, TestTime {
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        ITokenGovernance initBNTGovernance,
        IERC20 initVBNT,
        IBNTPool initBNTPool
    ) StandardRewards(initNetwork, initNetworkSettings, initBNTGovernance, initVBNT, initBNTPool) {}

    function nextProgramId() external view returns (uint256) {
        return _nextProgramId;
    }

    function claimRewardsWithAmounts(uint256[] calldata ids) external returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];

            ProgramData memory p = _programs[id];

            amounts[i] = _claimRewards(msg.sender, p).reward;
        }

        return amounts;
    }

    function setRemainingRewards(uint256 id, uint256 remainingRewards) external {
        _programs[id].remainingRewards = remainingRewards;
    }

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}
