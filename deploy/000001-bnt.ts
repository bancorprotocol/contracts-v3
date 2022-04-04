import {
    ContractInstance,
    deploy,
    execute,
    grantRole,
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

    const bntData = new TokenData(TokenSymbol.BNT);
    const bnt = await deploy({
        name: ContractInstance.BNT,
        contract: 'SmartToken',
        args: [bntData.name(), bntData.symbol(), bntData.decimals()],
        from: deployer
    });

    const bntGovernance = await deploy({
        name: ContractInstance.BNTGovernance,
        contract: 'TokenGovernance',
        args: [bnt],
        from: deployer
    });

    await grantRole({
        name: ContractInstance.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: foundationMultisig,
        from: deployer
    });

    await grantRole({
        name: ContractInstance.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_GOVERNOR,
        member: deployer,
        from: deployer
    });

    await revokeRole({
        name: ContractInstance.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractInstance.BNT,
        methodName: 'transferOwnership',
        args: [bntGovernance],
        from: deployer
    });

    await execute({
        name: ContractInstance.BNTGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await grantRole({
        name: ContractInstance.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractInstance.BNTGovernance,
        methodName: 'mint',
        args: [deployer, INITIAL_SUPPLY],
        from: deployer
    });

    await revokeRole({
        name: ContractInstance.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    return true;
};

func.skip = async () => isMainnet();

export default setDeploymentMetadata(__filename, func);
