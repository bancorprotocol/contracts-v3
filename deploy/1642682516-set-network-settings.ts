import { ContractName, DeploymentTag, execute, toDeployTag } from '../utils/Deploy';
import { toPPM, toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await execute({
        name: ContractName.NetworkSettings,
        methodName: 'setMinLiquidityForTrading',
        args: [toWei(10_000)],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettings,
        methodName: 'setNetworkFeePPM',
        args: [toPPM(15)],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettings,
        methodName: 'setWithdrawalFeePPM',
        args: [toPPM(0.25)],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettings,
        methodName: 'setFlashLoanFeePPM',
        args: [toPPM(0.09)],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettings,
        methodName: 'setVortexRewards',
        args: [{ burnRewardPPM: toPPM(10), burnRewardMaxAmount: toWei(100) }],
        from: deployer
    });

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.dependencies = [DeploymentTag.NetworkSettingsV1];
func.tags = [DeploymentTag.V3, tag];

export default func;
