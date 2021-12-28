import { NetworkToken, TokenGovernance } from '../../components/LegacyContracts';
import { AccessControlEnumerable } from '../../typechain-types';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { ContractId, Tags } from '../../utils/Deploy';
import { expectRole, roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { ethers, deployments, getNamedAccounts } from 'hardhat';

const { TokenGovernance: TokenGovernanceRoles } = roles;

describe.only('1640637513-network-token', () => {
    let deployer: string;
    let networkToken: NetworkToken;
    let networkTokenGovernance: TokenGovernance;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await deployments.fixture(Tags.V2);

        networkToken = await ethers.getContract<NetworkToken>(ContractId.NetworkToken);
        networkTokenGovernance = await ethers.getContract<TokenGovernance>(ContractId.NetworkTokenGovernance);
    });

    it('should deploy network token', async () => {
        expect(networkToken.address).not.to.equal(ZERO_ADDRESS);
        expect(networkTokenGovernance.address).not.to.equal(ZERO_ADDRESS);
    });

    it.only('should configure network token governance', async () => {
        expect(await networkToken.owner()).to.equal(networkTokenGovernance.address);

        await expectRole(
            networkTokenGovernance as any as AccessControlEnumerable,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            [deployer]
        );

        await expectRole(
            networkTokenGovernance as any as AccessControlEnumerable,
            TokenGovernanceRoles.ROLE_GOVERNOR,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            [deployer]
        );

        await expectRole(
            networkTokenGovernance as any as AccessControlEnumerable,
            TokenGovernanceRoles.ROLE_MINTER,
            TokenGovernanceRoles.ROLE_GOVERNOR,
            [deployer]
        );
    });
});
