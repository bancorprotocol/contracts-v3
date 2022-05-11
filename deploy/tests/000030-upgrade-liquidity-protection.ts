import { AccessControlEnumerable } from '../../components/Contracts';
import {
    Registry as LegacyRegistry,
    Roles as LegacyRoles,
    LiquidityProtection
} from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let deployerV2: string;
    let liquidityProtection: LiquidityProtection;

    before(async () => {
        ({ deployer, deployerV2 } = await getNamedAccounts());
    });

    beforeEach(async () => {
        liquidityProtection = await DeployedContracts.LegacyLiquidityProtection2.deployed();
    });

    it('should upgrade V2 liquidity protection contract', async () => {
        const legacyLiquidityProtection = await DeployedContracts.LegacyLiquidityProtection.deployed();
        expect(liquidityProtection.address).not.to.equal(legacyLiquidityProtection.address);

        const standardRewards = await DeployedContracts.StandardRewards.deployed();
        const legacyStakingRewards = await DeployedContracts.StakingRewards.deployed();
        const bntPool = await DeployedContracts.BNTPool.deployed();
        const bntGovernance = await DeployedContracts.BNTGovernance.deployed();

        const expectedRoles = isMainnet()
            ? [standardRewards.address, bntPool.address, liquidityProtection.address, legacyStakingRewards.address]
            : [standardRewards.address, bntPool.address];
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            expectedRoles
        );

        const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [bntPool.address, liquidityProtection.address] : [bntPool.address]
        );

        await expectRoleMembers(
            legacyStakingRewards as any as AccessControlEnumerable,
            LegacyRoles.StakingRewards.ROLE_PUBLISHER,
            [liquidityProtection.address]
        );

        const checkpointStore = await DeployedContracts.CheckpointStore.deployed();
        await expectRoleMembers(
            checkpointStore as any as AccessControlEnumerable,
            LegacyRoles.CheckpointStore.ROLE_OWNER,
            [deployer, deployerV2, liquidityProtection.address]
        );

        const liquidityProtectionStats = await DeployedContracts.LiquidityProtectionStats.deployed();
        await expectRoleMembers(
            liquidityProtectionStats as any as AccessControlEnumerable,
            LegacyRoles.LiquidityProtectionStats.ROLE_OWNER,
            [liquidityProtection.address]
        );

        const liquidityProtectionSystemStore = await DeployedContracts.LiquidityProtectionSystemStore.deployed();
        await expectRoleMembers(
            liquidityProtectionSystemStore as any as AccessControlEnumerable,
            LegacyRoles.LiquidityProtectionSystemStore.ROLE_OWNER,
            [liquidityProtection.address]
        );

        const liquidityProtectionStore = await DeployedContracts.LiquidityProtectionStore.deployed();
        expect(await liquidityProtectionStore.owner()).to.equal(liquidityProtection.address);
        expect(await liquidityProtectionStore.newOwner()).to.equal(ZERO_ADDRESS);

        const liquidityProtectionWallet = await DeployedContracts.LiquidityProtectionWallet.deployed();
        expect(await liquidityProtectionWallet.owner()).to.equal(liquidityProtection.address);
        expect(await liquidityProtectionWallet.newOwner()).to.equal(ZERO_ADDRESS);

        const contractRegistry = await DeployedContracts.ContractRegistry.deployed();
        expect(await contractRegistry.getAddress(LegacyRegistry.LIQUIDITY_PROTECTION)).to.equal(
            liquidityProtection.address
        );
    });
});
