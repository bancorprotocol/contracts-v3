import { DeployedContracts, grantRole, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { Roles } from '../../utils/Roles';
import { getNamedAccounts } from 'hardhat';
import { DeployFunction } from 'hardhat-deploy/types';

const func: DeployFunction = async () => {
    const { deployer } = await getNamedAccounts();

    const liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();

    // grant the ROLE_MIGRATION_MANAGER role to the contract
    await grantRole({
        name: InstanceName.BancorNetwork,
        id: Roles.BancorNetwork.ROLE_MIGRATION_MANAGER,
        member: liquidityProtection.address,
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
