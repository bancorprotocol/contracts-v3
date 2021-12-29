import { GovToken, TokenGovernance } from '../../components/LegacyContracts';
import { AccessControlEnumerable } from '../../typechain-types';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { ContractIds, Tags, isMainnet } from '../../utils/Deploy';
import { toWei } from '../../utils/Types';
import { expectRole, roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { ethers, deployments, getNamedAccounts } from 'hardhat';

const { TokenGovernance: TokenGovernanceRoles } = roles;

describe.only('1640637514-gov-token', () => {
    let deployer: string;
    let foundationMultisig: string;
    let govToken: GovToken;
    let govTokenGovernance: TokenGovernance;

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    before(async () => {
        ({ deployer, foundationMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await deployments.fixture(Tags.V2);

        govToken = await ethers.getContract<GovToken>(ContractIds.GovToken);
        govTokenGovernance = await ethers.getContract<TokenGovernance>(ContractIds.GovTokenGovernance);
    });

    it('should deploy gov token', async () => {
        expect(govToken.address).not.to.equal(ZERO_ADDRESS);
        expect(govTokenGovernance.address).not.to.equal(ZERO_ADDRESS);
    });

    it('should configure gov token governance', async () => {
        expect(await govToken.owner()).to.equal(govTokenGovernance.address);

        await expectRole(
            govTokenGovernance as any as AccessControlEnumerable,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            [foundationMultisig]
        );

        await expectRole(
            govTokenGovernance as any as AccessControlEnumerable,
            TokenGovernanceRoles.ROLE_GOVERNOR,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            [deployer]
        );

        if (!isMainnet()) {
            await expectRole(
                govTokenGovernance as any as AccessControlEnumerable,
                TokenGovernanceRoles.ROLE_MINTER,
                TokenGovernanceRoles.ROLE_GOVERNOR,
                [deployer]
            );

            expect(await govToken.balanceOf(deployer)).to.equal(TOTAL_SUPPLY);
        }
    });
});
