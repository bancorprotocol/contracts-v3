import { AccessControlEnumerable } from '../../components/Contracts';
import { BNT, TokenGovernance } from '../../components/LegacyContracts';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let foundationMultisig: string;
    let liquidityProtection: string;
    let legacyStakingRewards: string;
    let bnt: BNT;
    let bntGovernance: TokenGovernance;

    const INITIAL_SUPPLY = toWei(1_000_000_000);
    const bntData = new TokenData(TokenSymbol.BNT);

    before(async () => {
        ({ deployer, foundationMultisig, liquidityProtection, legacyStakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    });

    it('should deploy the BNT contract', async () => {
        expect(await bnt.name()).to.equal(bntData.name());
        expect(await bnt.symbol()).to.equal(bntData.symbol());
        expect(await bnt.decimals()).to.equal(bntData.decimals());
    });

    it('should deploy and configure the BNT governance contract', async () => {
        expect(await bntGovernance.token()).to.equal(bnt.address);

        expect(await bnt.owner()).to.equal(bntGovernance.address);

        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );
        await expectRoleMembers(bntGovernance as any as AccessControlEnumerable, Roles.TokenGovernance.ROLE_GOVERNOR, [
            deployer
        ]);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [liquidityProtection, legacyStakingRewards] : []
        );
    });

    if (!isMainnet()) {
        it('should mint the initial total supply', async () => {
            expect(await bnt.balanceOf(deployer)).to.equal(INITIAL_SUPPLY);
        });
    }
});
