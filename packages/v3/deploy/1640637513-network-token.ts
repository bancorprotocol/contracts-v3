import { ContractName, DeploymentTag, deploy, execute, isMainnet, grantRole, revokeRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const networkTokenData = new TokenData(TokenSymbol.BNT);
    const networkToken = await deploy({
        name: ContractName.NetworkToken,
        contract: 'SmartToken',
        args: [networkTokenData.name(), networkTokenData.symbol(), networkTokenData.decimals()],
        from: deployer
    });

    const networkTokenGovernance = await deploy({
        name: ContractName.NetworkTokenGovernance,
        contract: 'TokenGovernance',
        args: [networkToken],
        from: deployer
    });

    await grantRole({
        name: ContractName.NetworkTokenGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: foundationMultisig,
        from: deployer
    });

    await grantRole({
        name: ContractName.NetworkTokenGovernance,
        id: Roles.TokenGovernance.ROLE_GOVERNOR,
        member: deployer,
        from: deployer
    });

    await revokeRole({
        name: ContractName.NetworkTokenGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.NetworkToken,
        methodName: 'transferOwnership',
        args: [networkTokenGovernance],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await grantRole({
        name: ContractName.NetworkTokenGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.NetworkTokenGovernance,
        methodName: 'mint',
        args: [deployer, INITIAL_SUPPLY],
        from: deployer
    });

    await revokeRole({
        name: ContractName.NetworkTokenGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    return true;
};

func.id = ContractName.NetworkToken;
func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V2, ContractName.NetworkToken, ContractName.NetworkTokenGovernance];

export default func;
