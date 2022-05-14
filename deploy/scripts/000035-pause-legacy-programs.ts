import { Roles as LegacyRoles } from '../../components/LegacyContracts';
import { DeployedContracts, execute, grantRole, InstanceName, isLive, setDeploymentMetadata } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

export const PROGRAMS_POOL_TOKENS: string[] = [
    '0xb1CD6e4153B2a390Cf00A6556b0fC1458C4A5533',
    '0x04D0231162b4784b706908c787CE32bD075db9b7',
    '0xFEE7EeaA0c2f3F7C7e6301751a8dE55cE4D059Ec',
    '0x874d8dE5b26c9D9f6aA8d7bab283F9A9c6f777f4',
    '0x5365B5BC56493F08A38E5Eb08E36cBbe6fcC8306',
    '0xE5Df055773Bf9710053923599504831c7DBdD697'
];

export const PROGRAM_END_DELAY = duration.minutes(5);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, deployerV2 } = await getNamedAccounts();

    const stakingRewardsStore = await DeployedContracts.StakingRewardsStore.deployed();

    if (!(await stakingRewardsStore.hasRole(LegacyRoles.StakingRewardsStore.ROLE_MANAGER, deployer))) {
        if (isLive()) {
            throw new Error('Missing StakingRewardsStore ROLE_MANAGER role!');
        }

        await grantRole({
            name: InstanceName.StakingRewardsStore,
            id: LegacyRoles.StakingRewardsStore.ROLE_MANAGER,
            member: deployer,
            from: deployerV2
        });
    }

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    for (const poolToken of PROGRAMS_POOL_TOKENS) {
        await execute({
            name: InstanceName.StakingRewardsStore,
            methodName: 'setPoolProgramEndTime',
            args: [poolToken, now + PROGRAM_END_DELAY],
            from: deployer
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
