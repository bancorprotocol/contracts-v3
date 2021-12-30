import { GovToken, TokenGovernance } from '../../components/LegacyContracts';
import { AccessControlEnumerable } from '../../typechain-types';
import { Symbols, TokenNames, DeploymentTags } from '../../utils/Constants';
import { DeployedContracts, isMainnet, isMainnetFork, runTestDeployment } from '../../utils/Deploy';
import { toWei } from '../../utils/Types';
import { expectRole, roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

const { TokenGovernance: TokenGovernanceRoles } = roles;

describe('1640637514-gov-token', () => {
    let deployer: string;
    let foundationMultisig: string;
    let govToken: GovToken;
    let govTokenGovernance: TokenGovernance;

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    before(async () => {
        ({ deployer, foundationMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(DeploymentTags.V2);

        govToken = await DeployedContracts.GovToken.deployed();
        govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
    });

    it('should deploy the gov token', async () => {
        expect(await govToken.name()).to.equal(TokenNames.vBNT);
        expect(await govToken.symbol()).to.equal(Symbols.vBNT);
    });

    it('should deploy and configure the gov token governance', async () => {
        expect(await govTokenGovernance.token()).to.equal(govToken.address);
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

        if (!(isMainnet() || isMainnetFork())) {
            await expectRole(
                govTokenGovernance as any as AccessControlEnumerable,
                TokenGovernanceRoles.ROLE_MINTER,
                TokenGovernanceRoles.ROLE_GOVERNOR,
                [deployer]
            );
        }
    });

    if (!(isMainnet() || isMainnetFork())) {
        it('should mint the initial total supply', async () => {
            expect(await govToken.balanceOf(deployer)).to.equal(TOTAL_SUPPLY);
        });
    }
});
