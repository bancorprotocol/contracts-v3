import { ContractName, DeploymentTag, deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();

    await deployProxy({
        name: ContractName.ExternalRewardsVaultV1,
        from: deployer,
        args: [bntGovernance.address, vbntGovernance.address]
    });

    return true;
};

func.id = ContractName.ExternalRewardsVaultV1;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.ExternalRewardsVaultV1];

export default func;
