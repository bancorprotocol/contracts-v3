import { ContractName, DeploymentTag } from '../utils/Constants';
import { execute, initializeProxy, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const masterPool = await DeployedContracts.MasterPool.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    const poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgrader.deployed();

    const networkAddress = await initializeProxy({
        name: ContractName.BancorNetwork,
        proxyName: ContractName.BancorNetworkProxy,
        args: [masterPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address],
        from: deployer
    });

    await execute({
        name: ContractName.MasterVault,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, networkAddress],
        from: deployer
    });

    await execute({
        name: ContractName.MasterVault,
        methodName: 'grantRole',
        args: [Roles.Vault.ROLE_ASSET_MANAGER, networkAddress],
        from: deployer
    });

    await execute({
        name: ContractName.ExternalProtectionVault,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, networkAddress],
        from: deployer
    });

    await execute({
        name: ContractName.ExternalProtectionVault,
        methodName: 'grantRole',
        args: [Roles.Vault.ROLE_ASSET_MANAGER, networkAddress],
        from: deployer
    });

    return true;
};

func.id = ContractName.BancorNetwork;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.PendingWithdrawals,
    ContractName.PoolCollectionUpgrader
];
func.tags = [DeploymentTag.V3, ContractName.BancorNetwork];

export default func;
