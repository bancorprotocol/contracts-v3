import { ContractName, DeployedContracts, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();

    await deployProxy({
        name: ContractName.MasterVaultV1,
        from: deployer,
        args: [bntGovernance.address, vbntGovernance.address]
    });

    return true;
};

func.id = ContractName.MasterVaultV1;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.MasterVaultV1];

export default func;
