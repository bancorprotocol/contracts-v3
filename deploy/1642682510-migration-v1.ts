import { deploy, ContractName, DeploymentTag, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();

    await deploy({
        name: ContractName.BancorV1MigrationV1,
        from: deployer,
        args: [network.address, networkToken.address]
    });

    return true;
};

func.id = ContractName.AutoCompoundingStakingRewardsV1;
func.dependencies = [DeploymentTag.V2, ContractName.BancorNetworkV1];
func.tags = [DeploymentTag.V3, ContractName.BancorV1MigrationV1];

export default func;
