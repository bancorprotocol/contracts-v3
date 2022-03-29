import { ContractName, DeploymentTag, execute, toDeployTag } from '../utils/Deploy';
import { toPPM, toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await execute({
        name: ContractName.NetworkSettingsV1,
        methodName: 'setMinLiquidityForTrading',
        args: [toWei(10_000)],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettingsV1,
        methodName: 'setNetworkFeePPM',
        args: [toPPM(15)],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettingsV1,
        methodName: 'setWithdrawalFeePPM',
        args: [toPPM(0.25)],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettingsV1,
        methodName: 'setVortexRewards',
        args: [{ burnRewardPPM: toPPM(10), burnRewardMaxAmount: toWei(100) }],
        from: deployer
    });

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.dependencies = [ContractName.NetworkSettingsV1];
func.tags = [DeploymentTag.V3, tag];

export default func;
