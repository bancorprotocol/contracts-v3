import { AccessControlEnumerable, BancorNetwork } from '../../components/Contracts';
import { Registry as LegacyRegistry, Roles as LegacyRoles } from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { DeployedContracts, grantRole, InstanceName } from '../../utils/Deploy';
import { expect } from 'chai';
import { utils } from 'ethers';
import { getNamedAccounts } from 'hardhat';

const { getAddress } = utils;

interface State {
    prevAddress: string;
    totalPositionsValues: Record<string, string>;
}

const prevState: State = { prevAddress: '', totalPositionsValues: {} };

const beforeDeployments = async () => {
    const { deployer, foundationMultisig } = await getNamedAccounts();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();

    // mirror the mainnet prerequisite: the foundation multisig grants the deployer the BNT ROLE_GOVERNOR role before
    // the migration runs (000100-revoke-roles renounces it at the end of the pipeline)
    if (!(await bntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer))) {
        await grantRole({
            name: InstanceName.BNTGovernance,
            id: Roles.TokenGovernance.ROLE_GOVERNOR,
            member: deployer,
            from: foundationMultisig
        });
    }

    const prevLiquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
    const settings = await DeployedContracts.LiquidityProtectionSettings.deployed();

    prevState.prevAddress = prevLiquidityProtection.address;

    for (const pool of await settings.poolWhitelist()) {
        prevState.totalPositionsValues[pool] = (await prevLiquidityProtection.totalPositionsValue(pool)).toString();
    }
};

describeDeployment(
    __filename,
    () => {
        it('should upgrade the V2 liquidity protection contract', async () => {
            const { deployer } = await getNamedAccounts();

            const liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();
            const legacyLiquidityProtection = await DeployedContracts.LegacyLiquidityProtection5.deployed();

            expect(liquidityProtection.address).not.to.equal(prevState.prevAddress);
            expect(legacyLiquidityProtection.address).to.equal(prevState.prevAddress);

            // the new instance points at the same v2 contracts as the superseded one. note that the tracked v2
            // records store their addresses unchecksummed, unlike what the getters return
            const settings = await DeployedContracts.LiquidityProtectionSettings.deployed();
            const store = await DeployedContracts.LiquidityProtectionStore.deployed();
            const stats = await DeployedContracts.LiquidityProtectionStats.deployed();

            expect(getAddress(await liquidityProtection.settings())).to.equal(getAddress(settings.address));
            expect(getAddress(await liquidityProtection.store())).to.equal(getAddress(store.address));
            expect(getAddress(await liquidityProtection.stats())).to.equal(getAddress(stats.address));

            // the per-pool total positions value carried over
            for (const [pool, value] of Object.entries(prevState.totalPositionsValues)) {
                expect(await liquidityProtection.totalPositionsValue(pool)).to.equal(value);
            }

            // the new instance owns the store and the wallet
            expect(await liquidityProtection.owner()).to.equal(deployer);

            expect(await store.owner()).to.equal(liquidityProtection.address);
            expect(await store.newOwner()).to.equal(ZERO_ADDRESS);

            const wallet = await DeployedContracts.LiquidityProtectionWallet.deployed();
            expect(await wallet.owner()).to.equal(liquidityProtection.address);
            expect(await wallet.newOwner()).to.equal(ZERO_ADDRESS);

            // the new instance holds every permission of the superseded one, and the superseded one none
            await expectRoleMembers(
                stats as any as AccessControlEnumerable,
                LegacyRoles.LiquidityProtectionStats.ROLE_OWNER,
                [liquidityProtection.address]
            );

            const systemStore = await DeployedContracts.LiquidityProtectionSystemStore.deployed();
            await expectRoleMembers(
                systemStore as any as AccessControlEnumerable,
                LegacyRoles.LiquidityProtectionSystemStore.ROLE_OWNER,
                [liquidityProtection.address]
            );

            const standardRewards = await DeployedContracts.StandardRewards.deployed();
            const bntPool = await DeployedContracts.BNTPool.deployed();
            const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
            const stakingRewardsClaim = await DeployedContracts.StakingRewardsClaim.deployed();
            await expectRoleMembers(
                bntGovernance as any as AccessControlEnumerable,
                Roles.TokenGovernance.ROLE_MINTER,
                [standardRewards.address, bntPool.address, liquidityProtection.address, stakingRewardsClaim.address]
            );

            // the vBNT ROLE_MINTER role has no members: the superseded instance's grant from 000057 has since been
            // revoked on mainnet, and the new instance deliberately doesn't receive the role, since it's only
            // reachable from addLiquidity() and depositing stays disabled for the wind-down
            const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
            await expectRoleMembers(vbntGovernance as any as AccessControlEnumerable, Roles.TokenGovernance.ROLE_MINTER);

            const network = (await DeployedContracts.BancorNetwork.deployed()) as any as BancorNetwork;
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, [liquidityProtection.address]);

            // the deployer remains a BNT governor, until 000100-revoke-roles renounces it
            expect(await bntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer)).to.be.true;

            // the registry points at the new instance
            const registry = await DeployedContracts.ContractRegistry.deployed();
            expect(await registry.addressOf(LegacyRegistry.LIQUIDITY_PROTECTION)).to.equal(liquidityProtection.address);
        });
    },
    { beforeDeployments }
);
