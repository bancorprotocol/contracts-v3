import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import {LiquidityPoolCollection, TestLiquidityPoolCollection, TestERC20Token} from 'typechain';
import { createSystem } from 'test/helpers/Factory';
import { MAX_UINT256, PPM_RESOLUTION } from 'test/helpers/Constants';
import MathUtils from 'test/helpers/MathUtils';

const { Decimal } = MathUtils;

const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
const POOL_TYPE = BigNumber.from(1);
const SYMBOL = 'TKN';
const EMPTY_STRING = '';

let nonOwner: SignerWithAddress;

let reserveToken: TestERC20Token;

describe('LiquidityPoolCollection', () => {
    before(async () => {
        [, nonOwner] = await ethers.getSigners();
    });

    describe('stateful tests', () => {
        beforeEach(async () => {
            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
        });

        describe('construction', async () => {
            it('should be properly initialized', async () => {
                const { collection, network } = await createSystem();

                expect(await collection.version()).to.equal(1);

                expect(await collection.poolType()).to.equal(POOL_TYPE);
                expect(await collection.network()).to.equal(network.address);
                expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
            });
        });

        describe('token symbol overrides', async () => {
            const newSymbol = 'TKN2';
            let collection: LiquidityPoolCollection;

            beforeEach(async () => {
                ({ collection } = await createSystem());
            });

            it('should revert when a non-owner attempts to set a token symbol override', async () => {
                await expect(
                    collection.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should be to able to set and update a token symbol override', async () => {
                expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);

                await collection.setTokenSymbolOverride(reserveToken.address, newSymbol);
                expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(newSymbol);

                await collection.setTokenSymbolOverride(reserveToken.address, SYMBOL);
                expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(SYMBOL);

                await collection.setTokenSymbolOverride(reserveToken.address, EMPTY_STRING);
                expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);
            });
        });

        describe('default trading fee', async () => {
            const newDefaultTradingFree = BigNumber.from(100000);
            let collection: LiquidityPoolCollection;

            beforeEach(async () => {
                ({ collection } = await createSystem());

                expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
            });

            it('should revert when a non-owner attempts to set the default trading fee', async () => {
                await expect(
                    collection.connect(nonOwner).setDefaultTradingFeePPM(newDefaultTradingFree)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting the default trading fee to an invalid value', async () => {
                await expect(
                    collection.setDefaultTradingFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))
                ).to.be.revertedWith('ERR_INVALID_FEE');
            });

            it('should be to able to set and update the default trading fee', async () => {
                const res = await collection.setDefaultTradingFeePPM(newDefaultTradingFree);
                await expect(res)
                    .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                    .withArgs(DEFAULT_TRADING_FEE_PPM, newDefaultTradingFree);

                expect(await collection.defaultTradingFeePPM()).to.equal(newDefaultTradingFree);

                const res2 = await collection.setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
                await expect(res2)
                    .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                    .withArgs(newDefaultTradingFree, DEFAULT_TRADING_FEE_PPM);

                expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
            });
        });
    });

    describe('stateless tests', () => {
        let collection: TestLiquidityPoolCollection;

        before(async () => {
            collection = await Contracts.TestLiquidityPoolCollection.deploy(
                '0x1111111111111111111111111111111111111111'
            );
        });

        // tkn = f(f - bm - 2fm) / (fm + b)
        // bnt = af(b(2 - m) + f) / (b(b + fm))
        const arbitrageAmounts = (a: any, b: any, f: any, m: any) => {
            [a, b, f, m] = [a, b, f, m].map((x) => new Decimal(x));
            m = m.div(PPM_RESOLUTION.toNumber());
            return {
                tkn: f
                    .mul(f.sub(b.mul(m)).sub(f.mul(m).mul(2)))
                    .div(f.mul(m).add(b))
                    .floor(),
                bnt: a
                    .mul(f)
                    .mul(b.mul(m.sub(2).neg()).add(f))
                    .div(b.mul(b.add(f.mul(m))))
                    .floor()
            };
        };

        const validUint256 = (x: any) => {
            return x.gte(0) && x.lte(MAX_UINT256.toString());
        };

        const AMOUNTS = [
            ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(9).pow(x).toFixed()),
            ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(10).pow(x).toFixed())
        ];

        const FEES = [0, 0.05, 0.25, 0.5, 1].map((x) => (x * PPM_RESOLUTION.toNumber()) / 100);

        for (const a of AMOUNTS) {
            for (const b of AMOUNTS) {
                for (const f of AMOUNTS) {
                    for (const m of FEES) {
                        it(`arbitrageAmounts(${[a, b, f, m]})`, async () => {
                            const expected = arbitrageAmounts(a, b, f, m);
                            if (validUint256(expected.tkn) && validUint256(expected.bnt)) {
                                const actual = await collection.arbitrageAmountsTest(a, b, f, m);
                                expect(actual.tkn).to.be.equal(expected.tkn.toFixed());
                                expect(actual.bnt).to.be.equal(expected.bnt.toFixed());
                            } else {
                                await expect(collection.arbitrageAmountsTest(a, b, f, m)).to.be.revertedWith('');
                            }
                        });
                    }
                }
            }
        }
    });
});
