import { ContractInstance, execute, setDeploymentMetadata } from '../utils/Deploy';
import { toPPM, toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await execute({
        name: ContractInstance.NetworkSettings,
        methodName: 'setMinLiquidityForTrading',
        args: [toWei(10_000)],
        from: deployer
    });

    await execute({
        name: ContractInstance.NetworkSettings,
        methodName: 'setNetworkFeePPM',
        args: [toPPM(15)],
        from: deployer
    });

    await execute({
        name: ContractInstance.NetworkSettings,
        methodName: 'setWithdrawalFeePPM',
        args: [toPPM(0.25)],
        from: deployer
    });

    await execute({
        name: ContractInstance.NetworkSettings,
        methodName: 'setFlashLoanFeePPM',
        args: [toPPM(0.09)],
        from: deployer
    });

    await execute({
        name: ContractInstance.NetworkSettings,
        methodName: 'setVortexRewards',
        args: [{ burnRewardPPM: toPPM(10), burnRewardMaxAmount: toWei(100) }],
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
