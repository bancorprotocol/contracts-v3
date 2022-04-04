import { ContractInstance, DeployedContracts, deployProxy, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();

    await deployProxy({
        name: ContractInstance.PendingWithdrawals,
        from: deployer,
        args: [networkProxy.address, bnt.address, bntPool.address]
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
