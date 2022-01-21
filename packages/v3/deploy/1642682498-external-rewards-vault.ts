import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    const govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();

    await deployProxy({
        name: ContractName.ExternalRewardsVault,
        from: deployer,
        args: [networkTokenGovernance.address, govTokenGovernance.address]
    });

    return true;
};

func.id = ContractName.ExternalRewardsVault;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.ExternalRewardsVault];

export default func;
