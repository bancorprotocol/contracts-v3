import Contracts, {
    BancorNetworkInfo,
    MasterVault,
    NetworkSettings,
    TestArbitrage,
    TestBancorNetwork,
    TestFlashLoanRecipient,
    TestPoolCollection,
    IERC20
} from '../../components/Contracts';
import { NATIVE_TOKEN_ADDRESS, TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { Roles } from '../helpers/AccessControl';
import { createSystem, depositToPool, PoolSpec, setupFundedPool, TokenWithAddress } from '../helpers/Factory';
import { getBalance, getTransactionCost, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, BigNumberish, ContractTransaction, utils } from 'ethers';
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
const { solidityKeccak256, formatBytes32String } = utils;
import { latest } from '../helpers/Time';
import { TradeAmountAndFeeStructOutput } from '../../typechain-types/contracts/pools/PoolCollection';

describe('Arbitrage', () => {
    let deployer: SignerWithAddress;
    let trader: SignerWithAddress;
    let emergencyStopper: SignerWithAddress;
    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkSettings: NetworkSettings;
    let bnt: IERC20;
    let poolCollection: TestPoolCollection;
    let masterVault: MasterVault;
    let recipient: TestFlashLoanRecipient;
    let token: TokenWithAddress;
    let arbitrage: TestArbitrage;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
    const CONTEXT_ID = formatBytes32String('CTX');
    const MIN_RETURN_AMOUNT = BigNumber.from(1);

    before(async () => {
        [deployer, trader, emergencyStopper] = await ethers.getSigners();

        ({ network, networkInfo, networkSettings, poolCollection, masterVault, arbitrage, bnt } = await createSystem());
        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        await network.connect(deployer).grantRole(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, emergencyStopper.address);
    });

    describe('borrowBnt', () => {
        const BALANCE = toWei(100_000_000);
        const LOAN_AMOUNT = toWei(123_456);
        let FEE_AMOUNT = BigNumber.from(0);

        beforeEach(async () => {
            recipient = await Contracts.TestFlashLoanRecipient.deploy(network.address);

            const symbol = TokenSymbol.BNT;
            const flashLoanFee = 2.5;
            const tokenData = new TokenData(symbol);
            const flashLoanFeePPM = toPPM(flashLoanFee);
            FEE_AMOUNT = LOAN_AMOUNT.mul(flashLoanFeePPM).div(PPM_RESOLUTION);

            ({ token } = await setupFundedPool(
                {
                    tokenData,
                    balance: BALANCE,
                    requestedFunding: BALANCE.mul(1000),
                    bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                    baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                },
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            await networkSettings.setFlashLoanFeePPM(token.address, flashLoanFeePPM);
            await transfer(deployer, token, recipient.address, FEE_AMOUNT);
            await recipient.snapshot(token.address);
            await recipient.setAmountToReturn(LOAN_AMOUNT.add(FEE_AMOUNT));
        });

        it('should borrow BNT from the arbitrage contract', async () => {
            const prevVaultBalance = await getBalance(token, masterVault.address);
            const prevBNTBalance = await getBalance(token, network.address);
            const res = await arbitrage.borrow(bnt.address, LOAN_AMOUNT, recipient.address);

            await expect(res)
                .to.emit(network, 'FlashLoanCompleted')
                .withArgs(token.address, arbitrage.address, LOAN_AMOUNT, FEE_AMOUNT);

            const callbackData = await recipient.callbackData();
            expect(callbackData.caller).to.equal(arbitrage.address);
            expect(callbackData.token).to.equal(token.address);
            expect(callbackData.amount).to.equal(LOAN_AMOUNT);
            expect(callbackData.feeAmount).to.equal(FEE_AMOUNT);
            // expect(callbackData.data).to.equal('0x');
            expect(callbackData.receivedAmount).to.equal(LOAN_AMOUNT);

            expect(await getBalance(token, masterVault.address)).to.be.gte(prevVaultBalance.add(FEE_AMOUNT));
            expect(await getBalance(token, network.address)).to.equal(prevBNTBalance);
        });
    });

    describe('swapOnBancor', () => {
        let sourceToken: TokenWithAddress;
        let targetToken: TokenWithAddress;

        const setupPools = async (source: PoolSpec, target: PoolSpec) => {
            ({ token: sourceToken } = await setupFundedPool(
                source,
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            ({ token: targetToken } = await setupFundedPool(
                target,
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            ));

            // increase BNT liquidity by the growth factor a few times
            for (let i = 0; i < 5; i++) {
                await depositToPool(deployer, sourceToken, 1, network);
            }

            await network.setTime(await latest());
        };

        const swapBNT = async (beneficiaryAddress: string, amount: BigNumberish) => {
            const isSourceNativeToken = sourceToken.address === NATIVE_TOKEN_ADDRESS;
            const isTargetNativeToken = targetToken.address === NATIVE_TOKEN_ADDRESS;

            const traderAddress = await trader.getAddress();

            const deadline = MAX_UINT256;
            const beneficiary = beneficiaryAddress !== ZERO_ADDRESS ? beneficiaryAddress : traderAddress;

            const prevTraderSourceTokenAmount = await getBalance(sourceToken, traderAddress);
            const prevVaultSourceTokenAmount = await getBalance(sourceToken, masterVault.address);

            const prevBeneficiaryTargetTokenAmount = await getBalance(targetToken, beneficiary);
            const prevVaultTargetTokenAmount = await getBalance(targetToken, masterVault.address);

            let hop1!: TradeAmountAndFeeStructOutput;
            let hop2!: TradeAmountAndFeeStructOutput;

            const limit = MIN_RETURN_AMOUNT;

            hop1 = await network.callStatic.tradeBySourcePoolCollectionT(
                poolCollection.address,
                CONTEXT_ID,
                sourceToken.address,
                targetToken.address,
                amount,
                MIN_RETURN_AMOUNT
            );

            hop2 = hop1;

            let sourceAmount: BigNumber;
            let targetAmount: BigNumber;

            // when providing the source amount, the input amount represents the source amount we are willing to trade
            sourceAmount = BigNumber.from(amount);
            targetAmount = await networkInfo.tradeOutputBySourceAmount(
                sourceToken.address,
                targetToken.address,
                amount
            );
            expect(targetAmount).to.equal(hop2.amount);

            let pendingNetworkFeeAmount = await network.pendingNetworkFeeAmount();
            pendingNetworkFeeAmount = pendingNetworkFeeAmount.add(hop1.networkFeeAmount);

            const res = await arbitrage
                .connect(trader)
                .swapOnBancor(
                    sourceAmount,
                    sourceToken.address,
                    targetToken.address,
                    limit,
                    deadline,
                    beneficiaryAddress,
                    trader.address
                );

            const transactionCost = await getTransactionCost(res as ContractTransaction);

            const contextId = solidityKeccak256(
                ['address', 'uint32', 'address', 'address', 'uint256', 'uint256', 'bool', 'uint256', 'address'],
                [
                    traderAddress,
                    await network.currentTime(),
                    sourceToken.address,
                    targetToken.address,
                    amount,
                    limit,
                    true,
                    deadline,
                    beneficiary
                ]
            );

            await expect(res)
                .to.emit(network, 'TokensTraded')
                .withArgs(
                    contextId,
                    bnt.address,
                    targetToken.address,
                    sourceAmount,
                    targetAmount,
                    sourceAmount,
                    hop2.tradingFeeAmount,
                    0,
                    traderAddress
                );

            expect(await network.pendingNetworkFeeAmount()).to.equal(pendingNetworkFeeAmount);

            // ensure that the correct amount was transferred from the trader to the vault
            expect(await getBalance(sourceToken, traderAddress)).to.equal(
                prevTraderSourceTokenAmount.sub(
                    sourceAmount.add(isSourceNativeToken ? transactionCost : BigNumber.from(0))
                )
            );
            expect(await getBalance(sourceToken, masterVault.address)).to.equal(
                prevVaultSourceTokenAmount.add(sourceAmount)
            );

            // ensure that the correct amount was sent back to the trader
            expect(await getBalance(targetToken, beneficiary)).to.equal(
                prevBeneficiaryTargetTokenAmount.add(
                    targetAmount.sub(
                        traderAddress === beneficiary && isTargetNativeToken ? transactionCost : BigNumber.from(0)
                    )
                )
            );
            expect(await getBalance(targetToken, masterVault.address)).to.equal(
                prevVaultTargetTokenAmount.sub(targetAmount)
            );
        };

        beforeEach(async () => {
            const sourceBalance = toWei(1_000_000);
            const targetBalance = toWei(100_000_000);
            const tradingFeePercent = 5;
            const source: PoolSpec = {
                tokenData: new TokenData(TokenSymbol.BNT),
                balance: sourceBalance,
                requestedFunding: sourceBalance.mul(1000),
                tradingFeePPM: undefined,
                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
            };
            const target: PoolSpec = {
                tokenData: new TokenData(TokenSymbol.TKN),
                balance: targetBalance,
                requestedFunding: targetBalance.mul(1000),
                tradingFeePPM: toPPM(tradingFeePercent),
                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
            };
            await setupPools(source, target);
        });

        it('should swap BNT for token1 on Bancor', async () => {
            const bntAmount = BigNumber.from(toWei(1000));
            const reserveToken = await Contracts.TestERC20Token.attach(sourceToken.address);
            await reserveToken.transfer(trader.address, bntAmount);
            await reserveToken.connect(trader).approve(network.address, bntAmount);
            const beneficiary = ZERO_ADDRESS;
            await swapBNT(beneficiary, bntAmount);
        });
    });
});
