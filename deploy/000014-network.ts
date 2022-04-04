import {
    ContractInstance,
    DeployedContracts,
    grantRole,
    initializeProxy,
    setDeploymentMetadata
} from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntPool = await DeployedContracts.BNTPool.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    const poolMigrator = await DeployedContracts.PoolMigrator.deployed();

    const networkAddress = await initializeProxy({
        name: ContractInstance.BancorNetwork,
        proxyName: ContractInstance.BancorNetworkProxy,
        args: [bntPool.address, pendingWithdrawals.address, poolMigrator.address],
        from: deployer
    });

    await grantRole({
        name: ContractInstance.MasterVault,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractInstance.MasterVault,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractInstance.ExternalProtectionVault,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkAddress,
        from: deployer
    });

    await grantRole({
        name: ContractInstance.ExternalProtectionVault,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: networkAddress,
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
