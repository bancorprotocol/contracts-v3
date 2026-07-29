import { DeployedContracts, execute, InstanceName, isLive, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await execute({
        name: InstanceName.ProxyAdmin,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: deployer
    });

    return true;
};

// postpone the execution of this script to the end of the beta.
//
// the proxy admin has since been handed over on mainnet outside of these scripts - it belongs to proxyAdminOwner
// rather than to the daoMultisig this transfer targets - so the call above is no longer the deployer's to make and
// reverts. skip once the deployer no longer owns it, which also makes the script idempotent
func.skip = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    if (isLive()) {
        return true;
    }

    const { deployer } = await getNamedAccounts();
    const proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();

    return (await proxyAdmin.owner()) !== deployer;
};

export default setDeploymentMetadata(__filename, func);
