import { ContractName, deploy, DeploymentTag, execute, grantRole, isMainnet, revokeRole } from '../utils/Deploy';
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
        name: ContractName.BNT,
        contract: 'SmartToken',
        args: [bntData.name(), bntData.symbol(), bntData.decimals()],
        from: deployer
    });

    const bntGovernance = await deploy({
        name: ContractName.BNTGovernance,
        contract: 'TokenGovernance',
        args: [bnt],
        from: deployer
    });

    await grantRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: foundationMultisig,
        from: deployer
    });

    await grantRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_GOVERNOR,
        member: deployer,
        from: deployer
    });

    await revokeRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.BNT,
        methodName: 'transferOwnership',
        args: [bntGovernance],
        from: deployer
    });

    await execute({
        name: ContractName.BNTGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await grantRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.BNTGovernance,
        methodName: 'mint',
        args: [deployer, INITIAL_SUPPLY],
        from: deployer
    });

    await revokeRole({
        name: ContractName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.BNT;
func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V2, DeploymentTag.BNT, DeploymentTag.BNTGovernance];

export default func;
