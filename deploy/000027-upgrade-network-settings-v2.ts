import { ContractInstance, DeployedContracts, setDeploymentMetadata, upgradeProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bnt = await DeployedContracts.BNT.deployed();

    await upgradeProxy({
        name: ContractInstance.NetworkSettings,
        args: [bnt.address],
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
