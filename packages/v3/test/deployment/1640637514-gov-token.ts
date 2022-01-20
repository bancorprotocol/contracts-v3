import { AccessControlEnumerable } from '../../components/Contracts';
import { GovToken, TokenGovernance } from '../../components/LegacyContracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, isMainnet, runTestDeployment } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1640637514-gov-token', () => {
    let deployer: string;
    let foundationMultisig: string;
    let govToken: GovToken;
    let govTokenGovernance: TokenGovernance;

    const TOTAL_SUPPLY = toWei(1_000_000_000);
    const govTokenData = new TokenData(TokenSymbol.vBNT);

    before(async () => {
        ({ deployer, foundationMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment([ContractName.GovToken, ContractName.GovTokenGovernance]);

        govToken = await DeployedContracts.GovToken.deployed();
        govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
    });

    it('should deploy the gov token', async () => {
        expect(await govToken.name()).to.equal(govTokenData.name());
        expect(await govToken.symbol()).to.equal(govTokenData.symbol());
        expect(await govToken.decimals()).to.equal(govTokenData.decimals());
    });

    it('should deploy and configure the gov token governance', async () => {
        expect(await govTokenGovernance.token()).to.equal(govToken.address);
        expect(await govToken.owner()).to.equal(govTokenGovernance.address);

        await expectRole(
            govTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );

        await expectRole(
            govTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [deployer]
        );

        if (!isMainnet()) {
            await expectRole(
                govTokenGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                Roles.TokenGovernance.ROLE_GOVERNOR,
                [deployer]
            );
        }
    });

    if (!isMainnet()) {
        it('should mint the initial total supply', async () => {
            expect(await govToken.balanceOf(deployer)).to.equal(TOTAL_SUPPLY);
        });
    }
});
