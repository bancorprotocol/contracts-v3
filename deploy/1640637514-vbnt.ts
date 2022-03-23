import { ContractName, deploy, DeploymentTag, execute, grantRole, isMainnet, revokeRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, foundationMultisig } = await getNamedAccounts();

    const vbntData = new TokenData(TokenSymbol.VBNT);
    const vbnt = await deploy({
        name: ContractName.VBNT,
        contract: 'DSToken',
        args: [vbntData.name(), vbntData.symbol(), vbntData.decimals()],
        from: deployer
    });

    const vbntGovernance = await deploy({
        name: ContractName.VBNTGovernance,
        contract: 'TokenGovernance',
        args: [vbnt],
        from: deployer
    });

    await grantRole({
        name: ContractName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: foundationMultisig,
        from: deployer
    });

    await grantRole({
        name: ContractName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_GOVERNOR,
        member: deployer,
        from: deployer
    });

    await revokeRole({
        name: ContractName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_SUPERVISOR,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.VBNT,
        methodName: 'transferOwnership',
        args: [vbntGovernance],
        from: deployer
    });

    await execute({
        name: ContractName.VBNTGovernance,
        methodName: 'acceptTokenOwnership',
        from: foundationMultisig
    });

    await grantRole({
        name: ContractName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    await execute({
        name: ContractName.VBNTGovernance,
        methodName: 'mint',
        args: [deployer, INITIAL_SUPPLY],
        from: deployer
    });

    await revokeRole({
        name: ContractName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: deployer,
        from: deployer
    });

    return true;
};

func.id = ContractName.VBNT;
func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V2, ContractName.VBNT, ContractName.VBNTGovernance];

export default func;
