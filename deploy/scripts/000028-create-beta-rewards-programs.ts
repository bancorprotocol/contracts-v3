import { DeployedContracts, execute, InstanceName, isMainnet, setDeploymentMetadata } from '../../utils/Deploy';
import { duration } from '../../utils/Time';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { ethers } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

// TODO: make sure to update the starting time of all beta programs
const PROGRAM_START_DELAY = duration.hours(1);
const PROGRAM_DURATION = duration.weeks(4);
const TOTAL_REWARDS = toWei(44_500);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, dai, link } = await getNamedAccounts();
    const bnt = await DeployedContracts.BNT.deployed();

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    for (const pool of [bnt.address, NATIVE_TOKEN_ADDRESS, dai, link]) {
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

func.skip = async () => !isMainnet();

export default setDeploymentMetadata(__filename, func);
