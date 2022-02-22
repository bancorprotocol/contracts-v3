import { ContractName, DeploymentTag, deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const omniPool = await DeployedContracts.OmniPoolV1.deployed();

    await deployProxy({
        name: ContractName.PendingWithdrawalsV1,
        from: deployer,
        args: [networkProxy.address, bnt.address, omniPool.address]
    });

    return true;
};

func.id = ContractName.PendingWithdrawalsV1;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkProxy,
    ContractName.OmniPoolV1
];
func.tags = [DeploymentTag.V3, ContractName.PendingWithdrawalsV1];

export default func;
