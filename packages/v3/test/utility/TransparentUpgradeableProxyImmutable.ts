import Contracts from '../../components/Contracts';
import { TransparentUpgradeableProxyImmutable, TestLogic } from '../../typechain-types';
import { ZERO_ADDRESS } from '../helpers/Constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('TransparentUpgradeableProxyImmutable', () => {
    let deployer: SignerWithAddress;
    let nonAdmin: SignerWithAddress;

    const VERSION = 1;

    before(async () => {
        [deployer, nonAdmin] = await ethers.getSigners();
    });

    describe('construction', () => {
        let logic: TestLogic;

        beforeEach(async () => {
            logic = await Contracts.TestLogic.deploy();
        });

        it('should revert when attempting to create with an invalid logic contract', async () => {
            await expect(
                Contracts.TransparentUpgradeableProxyImmutable.deploy(ZERO_ADDRESS, deployer.address, [])
            ).to.be.revertedWith('ERC1967: new implementation is not a contract');

            await expect(
                Contracts.TransparentUpgradeableProxyImmutable.deploy(deployer.address, deployer.address, [])
            ).to.be.revertedWith('ERC1967: new implementation is not a contract');
        });

        it('should revert when attempting to create with an invalid admin', async () => {
            await expect(
                Contracts.TransparentUpgradeableProxyImmutable.deploy(logic.address, ZERO_ADDRESS, [])
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const proxy = await Contracts.TransparentUpgradeableProxyImmutable.deploy(
                logic.address,
                deployer.address,
                []
            );
            const contract = await Contracts.TestLogic.attach(proxy.address);

            expect(await proxy.callStatic.implementation()).to.equal(logic.address);
            expect(await proxy.callStatic.admin()).to.equal(deployer.address);
            expect(await contract.connect(nonAdmin).initialized()).to.be.false;
            expect(await contract.connect(nonAdmin).version()).to.equal(0);

            const proxy2 = await Contracts.TransparentUpgradeableProxyImmutable.deploy(
                logic.address,
                deployer.address,
                logic.interface.encodeFunctionData('initialize')
            );
            const contract2 = await Contracts.TestLogic.attach(proxy2.address);

            expect(await proxy2.callStatic.implementation()).to.equal(logic.address);
            expect(await proxy2.callStatic.admin()).to.equal(deployer.address);
            expect(await contract2.connect(nonAdmin).initialized()).to.be.true;
            expect(await contract2.connect(nonAdmin).version()).to.equal(VERSION);
        });
    });

    describe('proxy', () => {
        let logic: TestLogic;
        let proxy: TransparentUpgradeableProxyImmutable;
        let contract: TestLogic;

        beforeEach(async () => {
            logic = await Contracts.TestLogic.deploy();
            proxy = await Contracts.TransparentUpgradeableProxyImmutable.deploy(
                logic.address,
                deployer.address,
                logic.interface.encodeFunctionData('initialize')
            );
            contract = await Contracts.TestLogic.attach(proxy.address);
        });

        describe('callback', () => {
            it('should revert when an admin attempt to call into the contract', async () => {
                await expect(contract.version()).to.be.revertedWith('AccessDenied');
            });

            it('should allow a non-admin to call into the contract', async () => {
                expect(await contract.connect(nonAdmin).version()).to.equal(VERSION);
            });
        });

        describe('upgrade', () => {
            let newLogic: TestLogic;

            beforeEach(async () => {
                newLogic = await Contracts.TestLogic.deploy();
            });

            it('should revert when a non-admin attempts to upgrade the proxy', async () => {
                await expect(proxy.connect(nonAdmin).upgradeTo(newLogic.address)).to.be.revertedWith(
                    "function selector was not recognized and there's no fallback function"
                );
                await expect(proxy.connect(nonAdmin).upgradeToAndCall(newLogic.address, [])).to.be.revertedWith(
                    "function selector was not recognized and there's no fallback function"
                );
            });

            it('should revert when attempting to upgrade to an invalid logic contract', async () => {
                await expect(proxy.upgradeTo(ZERO_ADDRESS)).to.be.revertedWith(
                    'ERC1967: new implementation is not a contract'
                );
                await expect(proxy.upgradeTo(deployer.address)).to.be.revertedWith(
                    'ERC1967: new implementation is not a contract'
                );

                await expect(proxy.upgradeToAndCall(ZERO_ADDRESS, [])).to.be.revertedWith(
                    'ERC1967: new implementation is not a contract'
                );
                await expect(proxy.upgradeToAndCall(deployer.address, [])).to.be.revertedWith(
                    'ERC1967: new implementation is not a contract'
                );
            });

            it('should allow the admin to upgrade to a new logic contract', async () => {
                expect(await proxy.callStatic.implementation()).to.equal(logic.address);
                expect(await contract.connect(nonAdmin).initialized()).to.be.true;
                expect(await contract.connect(nonAdmin).version()).to.equal(VERSION);

                await proxy.upgradeTo(newLogic.address);

                expect(await proxy.callStatic.implementation()).to.equal(newLogic.address);
                expect(await contract.connect(nonAdmin).initialized()).to.be.true;
                expect(await contract.connect(nonAdmin).version()).to.equal(VERSION);

                const newVersion = 2;
                const newLogic2 = await Contracts.TestLogic.deploy();
                await proxy.upgradeToAndCall(
                    newLogic2.address,
                    newLogic.interface.encodeFunctionData('setVersion', [newVersion])
                );

                expect(await proxy.callStatic.implementation()).to.equal(newLogic2.address);
                expect(await contract.connect(nonAdmin).initialized()).to.be.true;
                expect(await contract.connect(nonAdmin).version()).to.equal(newVersion);
            });
        });
    });
});
