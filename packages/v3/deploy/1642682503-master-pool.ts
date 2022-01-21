import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, execute, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    const govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const masterPoolToken = await DeployedContracts.MasterPoolToken.deployed();

    const masterPoolAddress = await deployProxy(
        {
            name: ContractName.MasterPool,
            from: deployer,
            args: [
                networkProxy.address,
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                masterVault.address,
                masterPoolToken.address
            ]
        },
        {
            skipInitialization: true
        }
    );

    await execute({
        name: ContractName.MasterPoolToken,
        methodName: 'transferOwnership',
        args: [masterPoolAddress],
        from: daoMultisig
    });

    await execute({
        name: ContractName.MasterPool,
        methodName: 'initialize',
        from: deployer
    });

    await execute({
        name: ContractName.MasterPool,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, networkProxy.address],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_MINTER, masterPoolAddress],
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'grantRole',
        args: [Roles.TokenGovernance.ROLE_MINTER, masterPoolAddress],
        from: deployer
    });

    await execute({
        name: ContractName.MasterVault,
        methodName: 'grantRole',
        args: [Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, masterPoolAddress],
        from: daoMultisig
    });

    await execute({
        name: ContractName.MasterPool,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, daoMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.MasterPool,
        methodName: 'revokeRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, deployer],
        from: deployer
    });

    return true;
};

func.id = ContractName.MasterPool;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.NetworkSettings,
    ContractName.MasterVault,
    ContractName.MasterPoolToken
];
func.tags = [DeploymentTag.V3, ContractName.MasterPool];

export default func;
