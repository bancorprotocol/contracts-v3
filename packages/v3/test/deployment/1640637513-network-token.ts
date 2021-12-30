import { NetworkToken, TokenGovernance } from '../../components/LegacyContracts';
import { AccessControlEnumerable } from '../../typechain-types';
import { Symbols, TokenNames, ContractNames } from '../../utils/Constants';
import { DeployedContracts, isMainnet, runTestDeployment } from '../../utils/Deploy';
import { toWei } from '../../utils/Types';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

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
        await runTestDeployment([ContractNames.NetworkToken, ContractNames.NetworkTokenGovernance]);

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
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );

        await expectRole(
            networkTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [deployer]
        );

        if (!isMainnet()) {
            await expectRole(
                networkTokenGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                Roles.TokenGovernance.ROLE_GOVERNOR,
                [deployer]
            );
        }
    });

    if (!isMainnet()) {
        it('should mint the initial total supply', async () => {
            expect(await networkToken.balanceOf(deployer)).to.equal(TOTAL_SUPPLY);
        });
    }
});
