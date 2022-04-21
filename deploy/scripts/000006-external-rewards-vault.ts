import { DeployedContracts, deployProxy, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();

    await deployProxy({
        name: InstanceName.ExternalRewardsVault,
        from: deployer,
        args: [bntGovernance.address, vbntGovernance.address]
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
