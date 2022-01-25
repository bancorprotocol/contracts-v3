import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, execute, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    const govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const masterVault = await DeployedContracts.MasterVaultV1.deployed();
    const masterPoolToken = await DeployedContracts.MasterPoolTokenV1.deployed();

    const masterPoolAddress = await deployProxy(
        {
            name: ContractName.MasterPoolV1,
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
        name: ContractName.MasterPoolTokenV1,
        methodName: 'transferOwnership',
        args: [masterPoolAddress],
        from: deployer
    });

    await execute({
        name: ContractName.MasterPoolV1,
        methodName: 'initialize',
        from: deployer
    });

    await execute({
        name: ContractName.MasterPoolV1,
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
        name: ContractName.MasterVaultV1,
        methodName: 'grantRole',
        args: [Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, masterPoolAddress],
        from: deployer
    });

    return true;
};

func.id = ContractName.MasterPoolV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.NetworkSettingsV1,
    ContractName.MasterVaultV1,
    ContractName.MasterPoolTokenV1
];
func.tags = [DeploymentTag.V3, ContractName.MasterPoolV1];

export default func;
