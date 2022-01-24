import { ContractName, DeploymentTag } from '../utils/Constants';
import { execute, save, DeployedContracts } from '../utils/Deploy';
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
        name: ContractName.PoolTokenFactory,
        methodName: 'createPoolToken',
        args: [networkToken.address],
        from: deployer
    });

    const event = events![1] as PoolTokenCreated;
    const poolTokenAddress = event.args.poolToken;

    await save({
        name: ContractName.MasterPoolToken,
        contract: 'PoolToken',
        address: poolTokenAddress
    });

    await execute({
        name: ContractName.MasterPoolToken,
        methodName: 'acceptOwnership',
        from: deployer
    });

    return true;
};

func.id = ContractName.MasterPoolToken;
func.dependencies = [DeploymentTag.V2, ContractName.PoolTokenFactory];
func.tags = [DeploymentTag.V3, ContractName.MasterPoolToken];

export default func;
