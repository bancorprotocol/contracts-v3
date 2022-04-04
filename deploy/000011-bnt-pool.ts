import {
    ContractInstance,
    DeployedContracts,
    deployProxy,
    execute,
    grantRole,
    setDeploymentMetadata
} from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const bntPoolToken = await DeployedContracts.BNTPoolToken.deployed();

    const bntPoolAddress = await deployProxy(
        {
            name: ContractInstance.BNTPool,
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
        name: ContractInstance.BNTPoolToken,
        methodName: 'transferOwnership',
        args: [bntPoolAddress],
        from: deployer
    });

    await execute({
        name: ContractInstance.BNTPool,
        methodName: 'initialize',
        from: deployer
    });

    await grantRole({
        name: ContractInstance.BNTPool,
        id: Roles.Upgradeable.ROLE_ADMIN,
        member: networkProxy.address,
        from: deployer
    });

    await grantRole({
        name: ContractInstance.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: bntPoolAddress,
        from: deployer
    });

    await grantRole({
        name: ContractInstance.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: bntPoolAddress,
        from: deployer
    });

    await grantRole({
        name: ContractInstance.MasterVault,
        id: Roles.MasterVault.ROLE_BNT_MANAGER,
        member: bntPoolAddress,
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
