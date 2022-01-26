import { ContractName, DeploymentTag, deploy, execute, isMainnet, grantRole, revokeRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const govTokenData = new TokenData(TokenSymbol.vBNT);
    const govToken = await deploy({
        name: ContractName.GovToken,
        contract: 'DSToken',
        args: [govTokenData.name(), govTokenData.symbol(), govTokenData.decimals()],
        from: deployer
    });

    const govTokenGovernance = await deploy({
        name: ContractName.GovTokenGovernance,
        contract: 'TokenGovernance',
        args: [govToken],
        from: deployer
    });

    await grantRole({
        name: ContractName.GovTokenGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: foundationMultisig,
        from: deployer
    });

    await grantRole({
        name: ContractName.GovTokenGovernance,
        id: Roles.TokenGovernance.ROLE_GOVERNOR,
        member: deployer,
        from: deployer
    });

    await revokeRole({
        name: ContractName.GovTokenGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.GovToken,
        methodName: 'transferOwnership',
        args: [govTokenGovernance],
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await grantRole({
        name: ContractName.GovTokenGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.GovTokenGovernance,
        methodName: 'mint',
        args: [deployer, INITIAL_SUPPLY],
        from: deployer
    });

    await revokeRole({
        name: ContractName.GovTokenGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    return true;
};

func.id = ContractName.GovToken;
func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V2, ContractName.GovToken, ContractName.GovTokenGovernance];

export default func;
