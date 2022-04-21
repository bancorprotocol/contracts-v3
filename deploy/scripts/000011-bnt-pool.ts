import {
    DeployedContracts,
    deployProxy,
    execute,
    grantRole,
    initializeProxy,
    InstanceName,
    setDeploymentMetadata
} from '../../utils/Deploy';
import { Roles } from '../../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();

    const bntPoolAddress = await deployProxy(
        {
            name: InstanceName.BNTPoolProxy,
            contract: 'BNTPool',
            from: deployer,
            args: [
                networkProxy.address,
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                bnBNT.address
            ]
        },
        {
            skipInitialization: true
        }
    );

    await execute({
        name: InstanceName.bnBNT,
        methodName: 'transferOwnership',
        args: [bntPoolAddress],
        from: deployer
    });

    await initializeProxy({
        name: InstanceName.BNTPool,
        proxyName: InstanceName.BNTPoolProxy,
        args: [],
        from: deployer
    });

    await grantRole({
        name: InstanceName.BNTPool,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkProxy.address,
        from: deployer
    });

    await grantRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: bntPoolAddress,
        from: deployer
    });

    await grantRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: bntPoolAddress,
        from: deployer
    });

    await grantRole({
        name: InstanceName.MasterVault,
        id: Roles.MasterVault.ROLE_BNT_MANAGER,
        member: bntPoolAddress,
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
