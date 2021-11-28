/* eslint-disable camelcase */
import {
    BancorNetwork__factory,
    BancorVault__factory,
    ERC20__factory,
    ExternalProtectionVault__factory,
    ExternalRewardsVault__factory,
    MasterPool__factory,
    NetworkFeeVault__factory,
    NetworkSettings__factory,
    PendingWithdrawals__factory,
    PoolCollection__factory,
    PoolCollectionUpgrader__factory,
    PoolToken__factory,
    PoolTokenFactory__factory,
    ProxyAdmin__factory,
    TestBancorNetwork__factory,
    TestERC20Burnable__factory,
    TestERC20Token__factory,
    TestFlashLoanRecipient__factory,
    TestGovernedToken__factory,
    TestMasterPool__factory,
    TestMathEx__factory,
    TestOwned__factory,
    TestPendingWithdrawals__factory,
    TestPoolAverageRate__factory,
    TestPoolCollection__factory,
    TestPoolCollectionUpgrader__factory,
    TestPoolCollectionWithdrawal__factory,
    TestReserveToken__factory,
    TestSafeERC20Ex__factory,
    TestTokenGovernance__factory,
    TestUpgradeable__factory,
    TestVault__factory,
    TransparentUpgradeableProxy__factory
} from '../typechain-types';
import { deployOrAttach } from './ContractBuilder';

/* eslint-enable camelcase */
import { Signer } from 'ethers';

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    BancorNetwork: deployOrAttach('BancorNetwork', BancorNetwork__factory, signer),
    BancorVault: deployOrAttach('BancorVault', BancorVault__factory, signer),
    ERC20: deployOrAttach('ERC20', ERC20__factory, signer),
    ExternalProtectionVault: deployOrAttach('ExternalProtectionVault', ExternalProtectionVault__factory, signer),
    ExternalRewardsVault: deployOrAttach('ExternalRewardsVault', ExternalRewardsVault__factory, signer),
    NetworkFeeVault: deployOrAttach('NetworkFeeVault', NetworkFeeVault__factory, signer),
    NetworkSettings: deployOrAttach('NetworkSettings', NetworkSettings__factory, signer),
    MasterPool: deployOrAttach('MasterPool', MasterPool__factory, signer),
    PendingWithdrawals: deployOrAttach('PendingWithdrawals', PendingWithdrawals__factory, signer),
    PoolCollection: deployOrAttach('PoolCollection', PoolCollection__factory, signer),
    PoolCollectionUpgrader: deployOrAttach('PoolCollectionUpgrader', PoolCollectionUpgrader__factory, signer),
    PoolToken: deployOrAttach('PoolToken', PoolToken__factory, signer),
    PoolTokenFactory: deployOrAttach('PoolTokenFactory', PoolTokenFactory__factory, signer),
    ProxyAdmin: deployOrAttach('ProxyAdmin', ProxyAdmin__factory, signer),
    TestBancorNetwork: deployOrAttach('TestBancorNetwork', TestBancorNetwork__factory, signer),
    TestERC20Burnable: deployOrAttach('TestERC20Burnable', TestERC20Burnable__factory, signer),
    TestERC20Token: deployOrAttach('TestERC20Token', TestERC20Token__factory, signer),
    TestFlashLoanRecipient: deployOrAttach('TestFlashLoanRecipient', TestFlashLoanRecipient__factory, signer),
    TestGovernedToken: deployOrAttach('TestGovernedToken', TestGovernedToken__factory, signer),
    TestMathEx: deployOrAttach('TestMathEx', TestMathEx__factory, signer),
    TestMasterPool: deployOrAttach('TestMasterPool', TestMasterPool__factory, signer),
    TestOwned: deployOrAttach('TestOwned', TestOwned__factory, signer),
    TestPendingWithdrawals: deployOrAttach('TestPendingWithdrawals', TestPendingWithdrawals__factory, signer),
    TestPoolAverageRate: deployOrAttach('TestPoolAverageRate', TestPoolAverageRate__factory, signer),
    TestPoolCollection: deployOrAttach('TestPoolCollection', TestPoolCollection__factory, signer),
    TestPoolCollectionUpgrader: deployOrAttach(
        'TestPoolCollectionUpgrader',
        TestPoolCollectionUpgrader__factory,
        signer
    ),
    TestPoolCollectionWithdrawal: deployOrAttach('TestPoolCollectionWithdrawal', TestPoolCollectionWithdrawal__factory, signer),
    TestReserveToken: deployOrAttach('TestReserveToken', TestReserveToken__factory, signer),
    TestSafeERC20Ex: deployOrAttach('TestSafeERC20Ex', TestSafeERC20Ex__factory, signer),
    TestTokenGovernance: deployOrAttach('TestTokenGovernance', TestTokenGovernance__factory, signer),
    TestUpgradeable: deployOrAttach('TestUpgradeable', TestUpgradeable__factory, signer),
    TestVault: deployOrAttach('TestVault', TestVault__factory, signer),
    TransparentUpgradeableProxy: deployOrAttach(
        'TransparentUpgradeableProxy',
        TransparentUpgradeableProxy__factory,
        signer
    )
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
