import { ContractName, DeploymentTag, initializeProxy, DeployedContracts, grantRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const omniPool = await DeployedContracts.OmniPoolV1.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawalsV1.deployed();
    const poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();

    const networkAddress = await initializeProxy({
        name: ContractName.BancorNetworkV1,
        proxyName: ContractName.BancorNetworkProxy,
        args: [omniPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address],
        from: deployer
    });

    await grantRole({
        name: ContractName.OmniVaultV1,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.OmniVaultV1,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.ExternalProtectionVaultV1,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.ExternalProtectionVaultV1,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: networkAddress,
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
