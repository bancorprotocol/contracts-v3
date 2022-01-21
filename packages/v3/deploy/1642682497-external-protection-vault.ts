import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, execute, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    const networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    const govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();

    await deployProxy({
        name: ContractName.ExternalProtectionVault,
        from: deployer,
        args: [networkTokenGovernance.address, govTokenGovernance.address]
    });

    await execute({
        name: ContractName.ExternalProtectionVault,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, daoMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.ExternalProtectionVault,
        methodName: 'revokeRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, deployer],
        from: deployer
    });

    return true;
};

func.id = ContractName.ExternalProtectionVault;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.ExternalProtectionVault];

export default func;
