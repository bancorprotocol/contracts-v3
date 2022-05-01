import { AccessControlEnumerable } from '../../components/Contracts';
import { BNT, LiquidityProtection, StakingRewards, TokenGovernance } from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isMainnet, isMainnetFork } from '../../utils/Deploy';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let deployerV2: string;
    let foundationMultisig: string;
    let bnt: BNT;
    let bntGovernance: TokenGovernance;
    let legacyLiquidityProtection: LiquidityProtection;
    let legacyStakingRewards: StakingRewards;

    const INITIAL_SUPPLY = toWei(1_000_000_000);
    const bntData = new TokenData(TokenSymbol.BNT);

    before(async () => {
        ({ deployer, deployerV2, foundationMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        bnt = await DeployedContracts.BNT.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        legacyLiquidityProtection = await DeployedContracts.LegacyLiquidityProtection.deployed();
        legacyStakingRewards = await DeployedContracts.StakingRewards.deployed();
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
            [isMainnetFork() ? foundationMultisig : deployer]
        );
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            isMainnet() ? [deployerV2, deployer] : [deployer]
        );
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [legacyLiquidityProtection.address, legacyStakingRewards.address] : []
        );
    });

    if (!isMainnet()) {
        it('should mint the initial total supply', async () => {
            expect(await bnt.balanceOf(deployer)).to.equal(INITIAL_SUPPLY);
        });
    }
});
