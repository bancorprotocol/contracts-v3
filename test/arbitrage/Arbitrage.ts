import { toPPM, toWei } from '../../utils/Types';
import {
    Arbitrage,
    TestBancorNetwork,
    BancorNetworkInfo,
    NetworkSettings,
    TestPoolCollection
} from '../../components/Contracts';
import { PPM_RESOLUTION } from '../../utils/Constants';
import { createSystem, setupFundedPool, TokenWithAddress } from '../helpers/Factory';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { transfer } from '../helpers/Utils';

describe('Arbitrage', () => {
    let arbitrage: Arbitrage;
    let bntToken: TokenWithAddress;
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkSettings: NetworkSettings;
    let poolCollection: TestPoolCollection;

    const BNT_POOL_BALANCE = toWei(100_000_000);
    const LOAN_AMOUNT = toWei(123_456);
    const LOAN_FEE_PERCENT = 10;
    const LOAN_FEE_PPM = toPPM(LOAN_FEE_PERCENT);
    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const FEE_AMOUNT = LOAN_AMOUNT.mul(LOAN_FEE_PPM).div(PPM_RESOLUTION);

    before(async () => {
        [deployer, user] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkInfo, networkSettings, poolCollection, arbitrage } = await createSystem());
        ({ token: bntToken } = await setupFundedPool(
            {
                tokenData: new TokenData(TokenSymbol.BNT),
                balance: BNT_POOL_BALANCE,
                requestedFunding: BNT_POOL_BALANCE.mul(1000),
                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
            },
            deployer,
            network,
            networkInfo,
            networkSettings,
            poolCollection
        ));
        await networkSettings.setFlashLoanFeePPM(bntToken.address, LOAN_FEE_PPM);
        await transfer(deployer, bntToken, arbitrage.address, FEE_AMOUNT);
    });

    describe('arbitrage', () => {
        it('perfomes a flashloan', async () => {
            const res = await arbitrage.connect(user).arbitrage(LOAN_AMOUNT);

            await expect(res)
                .to.emit(network, 'FlashLoanCompleted')
                .withArgs(bntToken.address, arbitrage.address, LOAN_AMOUNT, FEE_AMOUNT);
        });
    });
});
