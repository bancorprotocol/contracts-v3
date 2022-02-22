import {
    BancorNetwork,
    BancorNetworkInfo,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterPool,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollectionUpgrader,
    PoolToken,
    ProxyAdmin
} from '../../components/Contracts';
import { VBNT, BNT, TokenGovernance } from '../../components/LegacyContracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682507-network-info', ContractName.BancorNetworkInfoV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let network: BancorNetwork;
    let bnt: BNT;
    let vbnt: VBNT;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let networkSettings: NetworkSettings;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let externalRewardsVault: ExternalRewardsVault;
    let masterPool: MasterPool;
    let masterPoolToken: PoolToken;
    let pendingWithdrawals: PendingWithdrawals;
    let poolCollectionUpgrader: PoolCollectionUpgrader;

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
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVaultV1.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();
        masterPool = await DeployedContracts.MasterPoolV1.deployed();
        masterPoolToken = await DeployedContracts.MasterPoolTokenV1.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawalsV1.deployed();
        poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfoV1.deployed();
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
        expect(await networkInfo.masterPool()).to.equal(masterPool.address);
        expect(await networkInfo.masterPoolToken()).to.equal(masterPoolToken.address);
        expect(await networkInfo.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
        expect(await networkInfo.poolCollectionUpgrader()).to.equal(poolCollectionUpgrader.address);

        await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
