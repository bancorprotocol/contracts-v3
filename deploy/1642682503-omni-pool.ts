import { ContractName, DeploymentTag, deployProxy, execute, DeployedContracts, grantRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const masterVault = await DeployedContracts.MasterVaultV1.deployed();
    const omniPoolToken = await DeployedContracts.OmniPoolTokenV1.deployed();

    const omniPoolAddress = await deployProxy(
        {
            name: ContractName.OmniPoolV1,
            from: deployer,
            args: [
                networkProxy.address,
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                omniPoolToken.address
            ]
        },
        {
            skipInitialization: true
        }
    );

    await execute({
        name: ContractName.OmniPoolTokenV1,
        methodName: 'transferOwnership',
        args: [omniPoolAddress],
        from: deployer
    });

    await execute({
        name: ContractName.OmniPoolV1,
        methodName: 'initialize',
        from: deployer
    });

    await grantRole({
        name: ContractName.OmniPoolV1,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkProxy.address,
        from: deployer
    });

    await grantRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: omniPoolAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: omniPoolAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.MasterVaultV1,
        id: Roles.MasterVault.ROLE_BNT_MANAGER,
        member: omniPoolAddress,
        from: deployer
    });

    return true;
};

func.id = ContractName.OmniPoolV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.NetworkSettingsV1,
    ContractName.MasterVaultV1,
    ContractName.OmniPoolTokenV1
];
func.tags = [DeploymentTag.V3, ContractName.OmniPoolV1];

export default func;
