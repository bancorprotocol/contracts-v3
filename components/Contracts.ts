/* eslint-disable camelcase */
import {
    AutoCompoundingStakingRewards__factory,
    BancorNetwork__factory,
    BancorNetworkInfo__factory,
    BancorPortal__factory,
    BancorV1Migration__factory,
    BNTPool__factory,
    ERC20__factory,
    ExternalProtectionVault__factory,
    ExternalRewardsVault__factory,
    MasterVault__factory,
    MockUniswapV2Factory__factory,
    MockUniswapV2Pair__factory,
    MockUniswapV2Router02__factory,
    NetworkSettings__factory,
    PendingWithdrawals__factory,
    PoolCollection__factory,
    PoolMigrator__factory,
    PoolToken__factory,
    PoolTokenFactory__factory,
    ProxyAdmin__factory,
    StandardStakingRewards__factory,
    TestAutoCompoundingStakingRewards__factory,
    TestBancorNetwork__factory,
    TestBNTPool__factory,
    TestERC20Burnable__factory,
    TestERC20Token__factory,
    TestFlashLoanRecipient__factory,
    TestFractionLibrary__factory,
    TestGovernedToken__factory,
    TestLogic__factory,
    TestMathEx__factory,
    TestOwned__factory,
    TestPendingWithdrawals__factory,
    TestPoolCollection__factory,
    TestPoolMigrator__factory,
    TestPoolCollectionWithdrawal__factory,
    TestSafeERC20Ex__factory,
    TestStakingRewardsMath__factory,
    TestStandardStakingRewards__factory,
    TestTokenGovernance__factory,
    TestTokenLibrary__factory,
    TestUpgradeable__factory,
    TestVault__factory,
    TransparentUpgradeableProxyImmutable__factory
} from '../typechain-types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export * from '../typechain-types';

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    AutoCompoundingStakingRewards: deployOrAttach(
        'AutoCompoundingStakingRewards',
        AutoCompoundingStakingRewards__factory,
        signer
    ),
    BancorNetwork: deployOrAttach('BancorNetwork', BancorNetwork__factory, signer),
    BancorNetworkInfo: deployOrAttach('BancorNetworkInfo', BancorNetworkInfo__factory, signer),
    BancorPortal: deployOrAttach('BancorPortal', BancorPortal__factory, signer),
    BancorV1Migration: deployOrAttach('BancorV1Migration', BancorV1Migration__factory, signer),
    BNTPool: deployOrAttach('BNTPool', BNTPool__factory, signer),
    ERC20: deployOrAttach('ERC20', ERC20__factory, signer),
    ExternalProtectionVault: deployOrAttach('ExternalProtectionVault', ExternalProtectionVault__factory, signer),
    ExternalRewardsVault: deployOrAttach('ExternalRewardsVault', ExternalRewardsVault__factory, signer),
    MasterVault: deployOrAttach('MasterVault', MasterVault__factory, signer),
    MockUniswapV2Factory: deployOrAttach('MockUniswapV2Factory', MockUniswapV2Factory__factory, signer),
    MockUniswapV2Pair: deployOrAttach('MockUniswapV2Pair', MockUniswapV2Pair__factory, signer),
    MockUniswapV2Router02: deployOrAttach('MockUniswapV2Router02', MockUniswapV2Router02__factory, signer),
    NetworkSettings: deployOrAttach('NetworkSettings', NetworkSettings__factory, signer),
    PendingWithdrawals: deployOrAttach('PendingWithdrawals', PendingWithdrawals__factory, signer),
    PoolCollection: deployOrAttach('PoolCollection', PoolCollection__factory, signer),
    PoolMigrator: deployOrAttach('PoolMigrator', PoolMigrator__factory, signer),
    PoolToken: deployOrAttach('PoolToken', PoolToken__factory, signer),
    PoolTokenFactory: deployOrAttach('PoolTokenFactory', PoolTokenFactory__factory, signer),
    ProxyAdmin: deployOrAttach('ProxyAdmin', ProxyAdmin__factory, signer),
    StandardStakingRewards: deployOrAttach('StandardStakingRewards', StandardStakingRewards__factory, signer),
    TestAutoCompoundingStakingRewards: deployOrAttach(
        'TestAutoCompoundingStakingRewards',
        TestAutoCompoundingStakingRewards__factory,
        signer
    ),
    TestBancorNetwork: deployOrAttach('TestBancorNetwork', TestBancorNetwork__factory, signer),
    TestERC20Burnable: deployOrAttach('TestERC20Burnable', TestERC20Burnable__factory, signer),
    TestERC20Token: deployOrAttach('TestERC20Token', TestERC20Token__factory, signer),
    TestFlashLoanRecipient: deployOrAttach('TestFlashLoanRecipient', TestFlashLoanRecipient__factory, signer),
    TestGovernedToken: deployOrAttach('TestGovernedToken', TestGovernedToken__factory, signer),
    TestLogic: deployOrAttach('TestLogic', TestLogic__factory, signer),
    TestMathEx: deployOrAttach('TestMathEx', TestMathEx__factory, signer),
    TestBNTPool: deployOrAttach('TestBNTPool', TestBNTPool__factory, signer),
    TestOwned: deployOrAttach('TestOwned', TestOwned__factory, signer),
    TestPendingWithdrawals: deployOrAttach('TestPendingWithdrawals', TestPendingWithdrawals__factory, signer),
    TestPoolCollection: deployOrAttach('TestPoolCollection', TestPoolCollection__factory, signer),
    TestPoolMigrator: deployOrAttach(
        'TestPoolMigrator',
        TestPoolMigrator__factory,
        signer
    ),
    TestPoolCollectionWithdrawal: deployOrAttach(
        'TestPoolCollectionWithdrawal',
        TestPoolCollectionWithdrawal__factory,
        signer
    ),
    TestSafeERC20Ex: deployOrAttach('TestSafeERC20Ex', TestSafeERC20Ex__factory, signer),
    TestStakingRewardsMath: deployOrAttach('TestStakingRewardsMath', TestStakingRewardsMath__factory, signer),
    TestStandardStakingRewards: deployOrAttach(
        'TestStandardStakingRewards',
        TestStandardStakingRewards__factory,
        signer
    ),
    TestTokenGovernance: deployOrAttach('TestTokenGovernance', TestTokenGovernance__factory, signer),
    TestTokenLibrary: deployOrAttach('TestTokenLibrary', TestTokenLibrary__factory, signer),
    TestFractionLibrary: deployOrAttach('TestFractionLibrary', TestFractionLibrary__factory, signer),
    TestUpgradeable: deployOrAttach('TestUpgradeable', TestUpgradeable__factory, signer),
    TestVault: deployOrAttach('TestVault', TestVault__factory, signer),
    TransparentUpgradeableProxyImmutable: deployOrAttach(
        'TransparentUpgradeableProxyImmutable',
        TransparentUpgradeableProxyImmutable__factory,
        signer
    )
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
