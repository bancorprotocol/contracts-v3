import { DeployedContracts, execute, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { toWei } from '../../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, bancorArbitrageAddress, carbonPOLAddress } = await getNamedAccounts();

    // get the deployed contracts
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();

    // upgrade the BancorNetwork contract
    await upgradeProxy({
        name: InstanceName.BancorNetwork,
        args: [
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            bnBNT.address,
            bancorArbitrageAddress,
            carbonPOLAddress
        ],
        from: deployer
    });

    // set the min network fee burn to 1M
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'setMinNetworkFeeBurn',
        args: [toWei(1_000_000)],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
