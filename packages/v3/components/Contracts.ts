/* eslint-disable camelcase */
import {
    BancorNetwork__factory,
    BancorVault__factory,
    ERC20__factory,
    ExternalProtectionVault__factory,
    NetworkFeeVault__factory,
    NetworkSettings__factory,
    NetworkTokenPool__factory,
    PendingWithdrawals__factory,
    PoolCollection__factory,
    PoolCollectionUpgrader__factory,
    PoolToken__factory,
    PoolTokenFactory__factory,
    ProxyAdmin__factory,
    ExternalRewardsVault__factory,
    TestBancorNetwork__factory,
    TestERC20Burnable__factory,
    TestERC20Token__factory,
    TestFlashLoanRecipient__factory,
    TestMathEx__factory,
    TestNetworkTokenPool__factory,
    TestOwned__factory,
    TestPendingWithdrawals__factory,
    TestPoolAverageRate__factory,
    TestPoolCollection__factory,
    TestPoolCollectionUpgrader__factory,
    TestReserveToken__factory,
    TestSafeERC20Ex__factory,
    TestUpgradeable__factory,
    TokenHolder__factory,
    TransparentUpgradeableProxy__factory,
    TestVault__factory
} from '../typechain';
import { deployOrAttach } from './ContractBuilder';

/* eslint-enable camelcase */
import { Signer } from 'ethers';

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    BancorNetwork: deployOrAttach('BancorNetwork', BancorNetwork__factory, signer),
    BancorVault: deployOrAttach('BancorVault', BancorVault__factory, signer),
    ERC20: deployOrAttach('ERC20', ERC20__factory, signer),
    ExternalProtectionVault: deployOrAttach('ExternalProtectionVault', ExternalProtectionVault__factory, signer),
    NetworkFeeVault: deployOrAttach('NetworkFeeVault', NetworkFeeVault__factory, signer),
    NetworkSettings: deployOrAttach('NetworkSettings', NetworkSettings__factory, signer),
    NetworkTokenPool: deployOrAttach('NetworkTokenPool', NetworkTokenPool__factory, signer),
    PendingWithdrawals: deployOrAttach('PendingWithdrawals', PendingWithdrawals__factory, signer),
    PoolCollection: deployOrAttach('PoolCollection', PoolCollection__factory, signer),
    PoolCollectionUpgrader: deployOrAttach('PoolCollectionUpgrader', PoolCollectionUpgrader__factory, signer),
    PoolToken: deployOrAttach('PoolToken', PoolToken__factory, signer),
    PoolTokenFactory: deployOrAttach('PoolTokenFactory', PoolTokenFactory__factory, signer),
    ProxyAdmin: deployOrAttach('ProxyAdmin', ProxyAdmin__factory, signer),
    ExternalRewardsVault: deployOrAttach('ExternalRewardsVault', ExternalRewardsVault__factory, signer),
    TestBancorNetwork: deployOrAttach('TestBancorNetwork', TestBancorNetwork__factory, signer),
    TestERC20Burnable: deployOrAttach('TestERC20Burnable', TestERC20Burnable__factory, signer),
    TestERC20Token: deployOrAttach('TestERC20Token', TestERC20Token__factory, signer),
    TestFlashLoanRecipient: deployOrAttach('TestFlashLoanRecipient', TestFlashLoanRecipient__factory, signer),
    TestPoolAverageRate: deployOrAttach('TestPoolAverageRate', TestPoolAverageRate__factory, signer),
    TestPoolCollection: deployOrAttach('TestPoolCollection', TestPoolCollection__factory, signer),
    TestPoolCollectionUpgrader: deployOrAttach(
        'TestPoolCollectionUpgrader',
        TestPoolCollectionUpgrader__factory,
        signer
    ),
    TestNetworkTokenPool: deployOrAttach('TestNetworkTokenPool', TestNetworkTokenPool__factory, signer),
    TestMathEx: deployOrAttach('TestMathEx', TestMathEx__factory, signer),
    TestOwned: deployOrAttach('TestOwned', TestOwned__factory, signer),
    TestPendingWithdrawals: deployOrAttach('TestPendingWithdrawals', TestPendingWithdrawals__factory, signer),
    TestReserveToken: deployOrAttach('TestReserveToken', TestReserveToken__factory, signer),
    TestSafeERC20Ex: deployOrAttach('TestSafeERC20Ex', TestSafeERC20Ex__factory, signer),
    TestUpgradeable: deployOrAttach('TestUpgradeable', TestUpgradeable__factory, signer),
    TestVault: deployOrAttach('TestVault', TestVault__factory, signer),
    TokenHolder: deployOrAttach('TokenHolder', TokenHolder__factory, signer),
    TransparentUpgradeableProxy: deployOrAttach(
        'TransparentUpgradeableProxy',
        TransparentUpgradeableProxy__factory,
        signer
    )
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
