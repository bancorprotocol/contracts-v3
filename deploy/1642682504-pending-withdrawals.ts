import { ContractName, DeployedContracts, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();

    await deployProxy({
        name: ContractName.PendingWithdrawals,
        from: deployer,
        args: [networkProxy.address, bnt.address, bntPool.address]
    });

    return true;
};

func.id = DeploymentTag.PendingWithdrawalsV1;
func.dependencies = [
    DeploymentTag.V2,
    DeploymentTag.ProxyAdmin,
    DeploymentTag.BancorNetworkProxy,
    DeploymentTag.BNTPoolV1
];
func.tags = [DeploymentTag.V3, DeploymentTag.PendingWithdrawalsV1];

export default func;
