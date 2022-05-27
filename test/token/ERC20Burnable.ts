import Contracts, { TestERC20Burnable } from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';

describe('ERC20Burnable', () => {
    let burnable: TestERC20Burnable;
    let owner: SignerWithAddress;
    let burner: SignerWithAddress;

    before(async () => {
        [owner, burner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        burnable = await Contracts.TestERC20Burnable.deploy('ERC', 'ERC1', 100_000);
    });

    describe('burning', () => {
        const testBurn = (amount: BigNumber) => {
            let res: ContractTransaction;
            let initialBalance: BigNumber;

            beforeEach(async () => {
                initialBalance = await burnable.balanceOf(owner.address);

                res = await burnable.connect(owner).burn(amount);
            });

            it('should burn the requested amount', async () => {
                expect(await burnable.balanceOf(owner.address)).to.equal(initialBalance.sub(amount));
            });

            it('should emit a transfer event', async () => {
                await expect(res).to.emit(burnable, 'Transfer').withArgs(owner.address, ZERO_ADDRESS, amount);
            });
        };

        context('when the given amount is not greater than balance of the sender', () => {
            context('for a zero amount', () => {
                testBurn(BigNumber.from(0));
            });

            context('for a non-zero amount', () => {
                testBurn(BigNumber.from(100));
            });
        });

        it('should revert when the given amount is greater than the balance of the sender', async () => {
            const initialBalance = await burnable.balanceOf(owner.address);

            await expect(burnable.connect(owner).burn(initialBalance.add(1))).to.be.revertedWithError(
                new TokenData(TokenSymbol.TKN).errors().burnExceedsBalance
            );
        });
    });

    describe('burning from', () => {
        describe('on success', () => {
            const testBurnFrom = (amount: BigNumber) => {
                let res: ContractTransaction;
                let initialBalance: BigNumber;

                const originalAllowance = amount.mul(3);

                beforeEach(async () => {
                    initialBalance = await burnable.balanceOf(owner.address);

                    await burnable.connect(owner).approve(burner.address, originalAllowance);
                    res = await burnable.connect(burner).burnFrom(owner.address, amount);
                });

                it('should burn the requested amount', async () => {
                    expect(await burnable.balanceOf(owner.address)).to.equal(initialBalance.sub(amount));
                });

                it('should decrement the allowance', async () => {
                    expect(await burnable.allowance(owner.address, burner.address)).to.equal(
                        originalAllowance.sub(amount)
                    );
                });

                it('should emit a transfer event', async () => {
                    await expect(res).to.emit(burnable, 'Transfer').withArgs(owner.address, ZERO_ADDRESS, amount);
                });
            };

            context('for a zero amount', () => {
                testBurnFrom(BigNumber.from(0));
            });

            context('for a non-zero amount', () => {
                testBurnFrom(BigNumber.from(100));
            });
        });

        it('should revert when the given amount is greater than the balance of the sender', async () => {
            const initialBalance = await burnable.balanceOf(owner.address);
            const amount = initialBalance.add(1);

            await burnable.connect(owner).approve(burner.address, amount);
            await expect(burnable.connect(owner).burnFrom(owner.address, amount)).to.be.revertedWithError(
                'panic code 0x11'
            );
        });

        it('should revert when the given amount is greater than the allowance', async () => {
            const allowance = 100;

            await burnable.connect(owner).approve(burner.address, allowance);
            await expect(burnable.connect(owner).burnFrom(owner.address, allowance + 1)).to.be.revertedWithError(
                'panic code 0x11'
            );
        });
    });
});
