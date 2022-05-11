import { DeployedContracts, execute, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const PROGRAM_START_DELAY = duration.minutes(10);
const PROGRAM_DURATION = duration.days(30);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, dai, link } = await getNamedAccounts();
    const bnt = await DeployedContracts.BNT.deployed();

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    const programRewards = {
        [bnt.address]: toWei(35_000),
        [NATIVE_TOKEN_ADDRESS]: toWei(100_000),
        [dai]: toWei(35_000),
        [link]: toWei(35_000)
    };

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
                programRewards[pool],
                now + PROGRAM_START_DELAY,
                now + PROGRAM_START_DELAY + PROGRAM_DURATION
            ],
            from: deployer
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
