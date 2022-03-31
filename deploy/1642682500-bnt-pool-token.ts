import { ContractName, DeployedContracts, DeploymentTag, execute, save } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

interface PoolTokenCreated {
    event: string;
    args: {
        poolToken: string;
        reserveToken: string;
    };
}

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bnt = await DeployedContracts.BNT.deployed();

    const { events } = await execute({
        name: ContractName.PoolTokenFactory,
        methodName: 'createPoolToken',
        args: [bnt.address],
        from: deployer
    });

    const event = events![1] as PoolTokenCreated;
    const poolTokenAddress = event.args.poolToken;

    await save({
        name: ContractName.BNTPoolToken,
        contract: 'PoolToken',
        address: poolTokenAddress
    });

    await execute({
        name: ContractName.BNTPoolToken,
        methodName: 'acceptOwnership',
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.BNTPoolTokenV1;
func.dependencies = [DeploymentTag.V2, DeploymentTag.PoolTokenFactoryV1];
func.tags = [DeploymentTag.V3, DeploymentTag.BNTPoolTokenV1];

export default func;
