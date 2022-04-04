import {
    BancorNetworkInfo,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    PendingWithdrawals,
    PoolMigrator,
    PoolToken,
    ProxyAdmin
} from '../../components/Contracts';
import { BNT, TokenGovernance, VBNT } from '../../components/LegacyContracts';
import { BancorNetworkV1, NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DeployedContracts, DeploymentTag } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682507-network-info', DeploymentTag.BancorNetworkInfoV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let network: BancorNetworkV1;
    let bnt: BNT;
    let vbnt: VBNT;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let networkSettings: NetworkSettingsV1;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let externalRewardsVault: ExternalRewardsVault;
    let bntPool: BNTPool;
    let bntPoolToken: PoolToken;
    let pendingWithdrawals: PendingWithdrawals;
    let poolMigrator: PoolMigrator;

    let networkInfo: BancorNetworkInfo;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        network = await DeployedContracts.BancorNetworkV1.deployed();
        bnt = await DeployedContracts.BNT.deployed();
        vbnt = await DeployedContracts.VBNT.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        bntPoolToken = await DeployedContracts.BNTPoolToken.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        poolMigrator = await DeployedContracts.PoolMigrator.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
    });

    it('should deploy and configure the network info contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(networkInfo.address)).to.equal(proxyAdmin.address);

        expect(await networkInfo.version()).to.equal(1);

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
        expect(await networkInfo.poolToken(bnt.address)).to.equal(bntPoolToken.address);
        expect(await networkInfo.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
        expect(await networkInfo.poolMigrator()).to.equal(poolMigrator.address);

        await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
