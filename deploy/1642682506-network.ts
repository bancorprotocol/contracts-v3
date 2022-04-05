import { ContractName, DeployedContracts, DeploymentTag, grantRole, initializeProxy } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntPool = await DeployedContracts.BNTPool.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    const poolMigrator = await DeployedContracts.PoolMigrator.deployed();

    const networkAddress = await initializeProxy({
        name: ContractName.BancorNetwork,
        proxyName: ContractName.BancorNetworkProxy,
        args: [bntPool.address, pendingWithdrawals.address, poolMigrator.address],
        from: deployer
    });

    await grantRole({
        name: ContractName.MasterVault,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.MasterVault,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.ExternalProtectionVault,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.ExternalProtectionVault,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: networkAddress,
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.BancorNetworkV1;
func.dependencies = [
    DeploymentTag.V2,
    DeploymentTag.ProxyAdmin,
    DeploymentTag.BancorNetworkProxy,
    DeploymentTag.PendingWithdrawalsV1,
    DeploymentTag.PoolMigratorV1
];
func.tags = [DeploymentTag.V3, DeploymentTag.BancorNetworkV1];

export default func;
