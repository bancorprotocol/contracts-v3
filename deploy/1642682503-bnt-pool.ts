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
    const bntPoolToken = await DeployedContracts.BNTPoolTokenV1.deployed();

    const bntPoolAddress = await deployProxy(
        {
            name: ContractName.BNTPoolV1,
            from: deployer,
            args: [
                networkProxy.address,
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                bntPoolToken.address
            ]
        },
        {
            skipInitialization: true
        }
    );

    await execute({
        name: ContractName.BNTPoolTokenV1,
        methodName: 'transferOwnership',
        args: [bntPoolAddress],
        from: deployer
    });

    await execute({
        name: ContractName.BNTPoolV1,
        methodName: 'initialize',
        from: deployer
    });

    await grantRole({
        name: ContractName.BNTPoolV1,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkProxy.address,
        from: deployer
    });

    await grantRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: bntPoolAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: bntPoolAddress,
        from: deployer
    });

    await grantRole({
        name: ContractName.MasterVaultV1,
        id: Roles.MasterVault.ROLE_BNT_MANAGER,
        member: bntPoolAddress,
        from: deployer
    });

    return true;
};

func.id = ContractName.BNTPoolV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.NetworkSettingsV1,
    ContractName.MasterVaultV1,
    ContractName.BNTPoolTokenV1
];
func.tags = [DeploymentTag.V3, ContractName.BNTPoolV1];

export default func;
