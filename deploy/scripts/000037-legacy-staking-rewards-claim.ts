import { deploy, DeployedContracts, grantRole, InstanceName, isLive, setDeploymentMetadata } from '../../utils/Deploy';
import Logger from '../../utils/Logger';
import { Roles } from '../../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

interface MerkleTree {
    root: string;
}

export const {
    root: merkleRoot
}: // eslint-disable-next-line @typescript-eslint/no-var-requires
MerkleTree = require('@bancor/contracts-solidity/snapshot/snapshot-merkle-tree.json');

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, deployerV2 } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();

    if (!(await bntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer))) {
        if (isLive()) {
            throw new Error('Missing BNT ROLE_GOVERNOR role!');
        }

        await grantRole({
            name: InstanceName.BNTGovernance,
            id: Roles.TokenGovernance.ROLE_GOVERNOR,
            member: deployer,
            from: deployerV2
        });
    }

    const network = await DeployedContracts.BancorNetworkV2.deployed();

    Logger.log(`Legacy staking rewards claim merkle root: ${merkleRoot}`);

    const stakingRewardsClaim = await deploy({
        name: InstanceName.StakingRewardsClaim,
        args: [network.address, bntGovernance.address, merkleRoot],
        from: deployer
    });

    // grant the BNT ROLE_MINTER role to the contract
    await grantRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: stakingRewardsClaim,
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
