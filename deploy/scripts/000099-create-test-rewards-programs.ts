import { DeployedContracts, execute, InstanceName, isLive, setDeploymentMetadata } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { toWei } from '../../utils/Types';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const PROGRAM_START_DELAY = duration.hours(1);
const PROGRAM_DURATION = duration.weeks(4);
const TOTAL_REWARDS = toWei(40_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
    const testToken1 = await DeployedContracts.TestToken1.deployed();
    const testToken2 = await DeployedContracts.TestToken2.deployed();

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    await execute({
        name: InstanceName.TestToken2,
        methodName: 'transfer',
        args: [externalRewardsVault.address, TOTAL_REWARDS],
        from: deployer
    });

    await execute({
        name: InstanceName.StandardRewards,
        methodName: 'createProgram',
        args: [
            testToken1.address,
            testToken2.address,
            TOTAL_REWARDS,
            now + PROGRAM_START_DELAY,
            now + PROGRAM_START_DELAY + PROGRAM_DURATION
        ],
        from: deployer
    });

    return true;
};

func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
