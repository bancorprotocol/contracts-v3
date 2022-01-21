import { ContractName, DeploymentTag } from '../utils/Constants';
import { execute, initializeProxy, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    const masterPool = await DeployedContracts.MasterPool.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    const poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgrader.deployed();

    await initializeProxy({
        name: ContractName.BancorNetwork,
        proxyName: ContractName.BancorNetworkProxy,
        args: [masterPool.address, pendingWithdrawals.address, poolCollectionUpgrader.address],
        from: deployer
    });

    await execute({
        name: ContractName.BancorNetwork,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, daoMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.BancorNetwork,
        methodName: 'revokeRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, deployer],
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
