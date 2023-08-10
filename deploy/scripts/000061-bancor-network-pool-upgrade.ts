import { ARB_CONTRACT_MAINNET_ADDRESS, CARBON_POL_CONTRACT_MAINNET_ADDRESS } from '../../utils/Constants';
import { DeployedContracts, execute, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    // get the deployed contracts
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();

    // pause the network
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'pause',
        from: deployer
    });

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
            ARB_CONTRACT_MAINNET_ADDRESS,
            CARBON_POL_CONTRACT_MAINNET_ADDRESS
        ],
        from: deployer
    });

    // set the rewards ppm to 2000 (0.2%)
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'setRewardsPPM',
        args: [2000],
        from: deployer
    });

    // resum the bancor network
    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'resume',
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
