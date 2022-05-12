import {
    BancorNetwork,
    BancorNetworkInfo,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolMigrator,
    PoolToken
} from '../../components/Contracts';
import { BNT, TokenGovernance, VBNT } from '../../components/LegacyContracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let network: BancorNetwork;
    let bnt: BNT;
    let vbnt: VBNT;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let networkSettings: NetworkSettings;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let externalRewardsVault: ExternalRewardsVault;
    let bntPool: BNTPool;
    let bnBNT: PoolToken;
    let pendingWithdrawals: PendingWithdrawals;
    let poolMigrator: PoolMigrator;

    let networkInfo: BancorNetworkInfo;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetwork.deployed();
        bnt = await DeployedContracts.BNT.deployed();
        vbnt = await DeployedContracts.VBNT.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        networkSettings = await DeployedContracts.NetworkSettings.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        bnBNT = await DeployedContracts.bnBNT.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        poolMigrator = await DeployedContracts.PoolMigrator.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
    });

    it('should upgrade and configure the network info contract', async () => {
        expect(await networkInfo.version()).to.equal(2);

        expect(await networkInfo.network()).to.equal(network.address);
        expect(await networkInfo.bnt()).to.equal(bnt.address);
        expect(await networkInfo.bntGovernance()).to.equal(bntGovernance.address);
        expect(await networkInfo.vbnt()).to.equal(vbnt.address);
        expect(await networkInfo.vbntGovernance()).to.equal(vbntGovernance.address);
        expect(await networkInfo.networkSettings()).to.equal(networkSettings.address);
        expect(await networkInfo.masterVault()).to.equal(masterVault.address);
        expect(await networkInfo.externalProtectionVault()).to.equal(externalProtectionVault.address);
        expect(await networkInfo.externalRewardsVault()).to.equal(externalRewardsVault.address);
        expect(await networkInfo.bntPool()).to.equal(bntPool.address);
        expect(await networkInfo.poolToken(bnt.address)).to.equal(bnBNT.address);
        expect(await networkInfo.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
        expect(await networkInfo.poolMigrator()).to.equal(poolMigrator.address);

        await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
