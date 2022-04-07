import {
    deploy,
    execute,
    grantRole,
    InstanceName,
    isMainnet,
    revokeRole,
    setDeploymentMetadata
} from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const vbntData = new TokenData(TokenSymbol.vBNT);
    const vbnt = await deploy({
        name: InstanceName.VBNT,
        contract: 'DSToken',
        args: [vbntData.name(), vbntData.symbol(), vbntData.decimals()],
        from: deployer
    });

    const vbntGovernance = await deploy({
        name: InstanceName.VBNTGovernance,
        contract: 'TokenGovernance',
        args: [vbnt],
        from: deployer
    });

    await grantRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: foundationMultisig,
        from: deployer
    });

    await grantRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_GOVERNOR,
        member: deployer,
        from: deployer
    });

    await revokeRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: deployer,
        from: deployer
    });

    await execute({
        name: InstanceName.VBNT,
        methodName: 'transferOwnership',
        args: [vbntGovernance],
        from: deployer
    });

    await execute({
        name: InstanceName.VBNTGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await grantRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: InstanceName.VBNTGovernance,
        methodName: 'mint',
        args: [deployer, INITIAL_SUPPLY],
        from: deployer
    });

    await revokeRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    return true;
};

func.skip = async () => isMainnet();

export default setDeploymentMetadata(__filename, func);
