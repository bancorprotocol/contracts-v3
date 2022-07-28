import { DeployedContracts, InstanceName, revokeRole, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { Roles } from '../../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const vbnt = await DeployedContracts.VBNT.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();

    const standardRewardsAddress = await upgradeProxy({
        name: InstanceName.StandardRewards,
        args: [network.address, networkSettings.address, bntGovernance.address, vbnt.address, bntPool.address],
        from: deployer
    });

    await revokeRole({
        name: InstanceName.ExternalAutoCompoundingRewardsVault,
        id: Roles.Vault.ROLE_ASSET_MANAGER,
        member: standardRewardsAddress,
        from: deployer
    });

    return true;
};

func.skip = async () => true;

export default setDeploymentMetadata(__filename, func);
