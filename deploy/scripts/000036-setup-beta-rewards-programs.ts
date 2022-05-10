import { DeployedContracts, execute, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

export const PROGRAM_START_DELAY = duration.hours(1);
export const PROGRAM_DURATION = duration.weeks(4);
export const TOTAL_REWARDS = toWei(44_500);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, dai, link } = await getNamedAccounts();
    const bnt = await DeployedContracts.BNT.deployed();

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    const standardRewards = await DeployedContracts.StandardRewards.deployed();

    for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
        const id = await standardRewards.latestProgramId(pool);

        await execute({
            name: InstanceName.StandardRewards,
            methodName: 'terminateProgram',
            args: [id],
            from: deployer
        });

        await execute({
            name: InstanceName.StandardRewards,
            methodName: 'createProgram',
            args: [
                pool,
                bnt.address,
                TOTAL_REWARDS,
                now + PROGRAM_START_DELAY,
                now + PROGRAM_START_DELAY + PROGRAM_DURATION
            ],
            from: deployer
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
