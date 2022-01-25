import { ContractName, DeploymentTag } from '../utils/Constants';
import { execute, initializeProxy, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const masterPool = await DeployedContracts.MasterPoolV1.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawalsV1.deployed();
    const poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();

    const networkAddress = await initializeProxy({
        name: ContractName.BancorNetworkV1,
        proxyName: ContractName.BancorNetworkProxy,
        args: [masterPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address],
        from: deployer
    });

    await execute({
        name: ContractName.MasterVaultV1,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, networkAddress],
        from: deployer
    });

    await execute({
        name: ContractName.MasterVaultV1,
        methodName: 'grantRole',
        args: [Roles.Vault.ROLE_ASSET_MANAGER, networkAddress],
        from: deployer
    });

    await execute({
        name: ContractName.ExternalProtectionVaultV1,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, networkAddress],
        from: deployer
    });

    await execute({
        name: ContractName.ExternalProtectionVaultV1,
        methodName: 'grantRole',
        args: [Roles.Vault.ROLE_ASSET_MANAGER, networkAddress],
        from: deployer
    });

    return true;
};

func.id = ContractName.BancorNetworkV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.PendingWithdrawalsV1,
    ContractName.PoolCollectionUpgraderV1
];
func.tags = [DeploymentTag.V3, ContractName.BancorNetworkV1];

export default func;
