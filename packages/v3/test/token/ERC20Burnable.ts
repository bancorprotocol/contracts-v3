import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, ContractTransaction } from 'ethers';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { TestERC20Burnable } from 'typechain';

import { ZERO_ADDRESS } from 'test/helpers/Constants';

let burnable: TestERC20Burnable;
let owner: SignerWithAddress;
let burner: SignerWithAddress;

describe('ERC20Burnable', () => {
    before(async () => {
        [owner, burner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        burnable = await Contracts.TestERC20Burnable.deploy('ERC', 'ERC1', 100000);
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

            await expect(burnable.connect(owner).burn(initialBalance.add(1))).to.be.revertedWith(
                'ERC20: burn amount exceeds balance'
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
            await expect(burnable.connect(owner).burnFrom(owner.address, amount)).to.be.revertedWith(
                'ERR_INSUFFICIENT_ALLOWANCE'
            );
        });

        it('should revert when the given amount is greater than the allowance', async () => {
            const initialBalance = await burnable.balanceOf(owner.address);
            const allowance = BigNumber.from(100);

            await burnable.connect(owner).approve(burner.address, allowance);
            await expect(burnable.connect(owner).burnFrom(owner.address, allowance.add(1))).to.be.revertedWith(
                'ERR_INSUFFICIENT_ALLOWANCE'
            );
        });
    });
});
