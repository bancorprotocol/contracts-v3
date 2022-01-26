import { ContractName, DeploymentTag, execute, save, DeployedContracts } from '../utils/Deploy';
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

    const networkToken = await DeployedContracts.NetworkToken.deployed();

    const { events } = await execute({
        name: ContractName.PoolTokenFactoryV1,
        methodName: 'createPoolToken',
        args: [networkToken.address],
        from: deployer
    });

    const event = events![1] as PoolTokenCreated;
    const poolTokenAddress = event.args.poolToken;

    await save({
        name: ContractName.MasterPoolTokenV1,
        contract: 'PoolToken',
        address: poolTokenAddress
    });

    await execute({
        name: ContractName.MasterPoolTokenV1,
        methodName: 'acceptOwnership',
        from: deployer
    });

    return true;
};

func.id = ContractName.MasterPoolTokenV1;
func.dependencies = [DeploymentTag.V2, ContractName.PoolTokenFactoryV1];
func.tags = [DeploymentTag.V3, ContractName.MasterPoolTokenV1];

export default func;
