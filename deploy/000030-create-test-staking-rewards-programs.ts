import Contracts from '../components/Contracts';
import { StakingRewardsDistributionType } from '../utils/Constants';
import { DeployedContracts, execute, InstanceName, isLive, setDeploymentMetadata } from '../utils/Deploy';
import { duration } from '../utils/Time';
import { toWei } from '../utils/Types';
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
    const testToken5 = await DeployedContracts.TestToken5.deployed();

    const { timestamp: now } = await ethers.provider.getBlock('latest');

    await execute({
        name: InstanceName.TestToken2,
        methodName: 'transfer',
        args: [externalRewardsVault.address, TOTAL_REWARDS],
        from: deployer
    });

    await execute({
        name: InstanceName.StandardStakingRewards,
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

    const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    const poolTokenAddress = await poolCollection.poolToken(testToken5.address);
    const poolToken = await Contracts.PoolToken.attach(poolTokenAddress);
    const poolTokensToBurn = await poolCollection.underlyingToPoolToken(testToken5.address, TOTAL_REWARDS);
    await poolToken.connect(await ethers.getSigner(deployer)).transfer(externalRewardsVault.address, poolTokensToBurn);

    await execute({
        name: InstanceName.AutoCompoundingStakingRewards,
        methodName: 'createProgram',
        args: [
            testToken5.address,
            TOTAL_REWARDS,
            StakingRewardsDistributionType.ExponentialDecay,
            now + PROGRAM_START_DELAY,
            0
        ],
        from: deployer
    });
};

func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
