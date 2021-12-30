import { NetworkToken, TokenGovernance } from '../../components/LegacyContracts';
import { AccessControlEnumerable } from '../../typechain-types';
import { Symbols, TokenNames, DeploymentTags } from '../../utils/Constants';
import { DeployedContracts, isMainnet, isMainnetFork, runTestDeployment } from '../../utils/Deploy';
import { toWei } from '../../utils/Types';
import { expectRole, roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

const { TokenGovernance: TokenGovernanceRoles } = roles;

describe('1640637513-network-token', () => {
    let deployer: string;
    let foundationMultisig: string;
    let networkToken: NetworkToken;
    let networkTokenGovernance: TokenGovernance;

    const TOTAL_SUPPLY = toWei(1_000_000_000);

    before(async () => {
        ({ deployer, foundationMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(DeploymentTags.V2);

        networkToken = await DeployedContracts.NetworkToken.deployed();
        networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    });

    it('should deploy the network token', async () => {
        expect(await networkToken.name()).to.equal(TokenNames.BNT);
        expect(await networkToken.symbol()).to.equal(Symbols.BNT);
    });

    it('should deploy and configure the network token governance', async () => {
        expect(await networkTokenGovernance.token()).to.equal(networkToken.address);
        expect(await networkToken.owner()).to.equal(networkTokenGovernance.address);

        await expectRole(
            networkTokenGovernance as any as AccessControlEnumerable,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            [foundationMultisig]
        );

        await expectRole(
            networkTokenGovernance as any as AccessControlEnumerable,
            TokenGovernanceRoles.ROLE_GOVERNOR,
            TokenGovernanceRoles.ROLE_SUPERVISOR,
            [deployer]
        );

        if (!(isMainnet() || isMainnetFork())) {
            await expectRole(
                networkTokenGovernance as any as AccessControlEnumerable,
                TokenGovernanceRoles.ROLE_MINTER,
                TokenGovernanceRoles.ROLE_GOVERNOR,
                [deployer]
            );
        }
    });

    if (!(isMainnet() || isMainnetFork())) {
        it('should mint the initial total supply', async () => {
            expect(await networkToken.balanceOf(deployer)).to.equal(TOTAL_SUPPLY);
        });
    }
});
